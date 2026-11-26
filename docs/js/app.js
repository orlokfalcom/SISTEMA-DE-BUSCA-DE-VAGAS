/**
 * VagaPulse AI — Controlador Principal (ES Module, 100% no Navegador)
 * Orquestra Web Workers (NLP + Embeddings MiniLM), Índice Invertido, Feedback Loop,
 * Telemetria de Performance e Rendering Incremental/Virtualizado.
 */

import {
  buildAtsImprovementPlan,
  buildSamplePdfBlob,
  evaluateAtsReadiness,
  extractTextFromPdfFile,
  recommendCourses,
} from "./ats.js";
import { buildExternalLinks, collectJobsWithTelemetry } from "./fetcher.js";
import { InvertedIndex } from "./index.js";
import {
  DEFAULT_WEIGHTS,
  adaptWeightsFromFeedback,
  compareCustomJob,
  computeSkillGaps,
  highlightMatchedTerms,
  matchJobsHybrid,
  normalizeWeights,
} from "./matcher.js";
import {
  CANONICAL_SKILLS,
  extractCanonicalJob,
  extractCanonicalProfile,
  resolveSkillAlias,
  suggestRoles,
} from "./nlp.js";
import { SUPPORTED_LANGUAGES, applyUiTranslations, applyUiTranslationsAsync, getUiLang, t } from "./i18n.js";
import { getTranslatedJobView, translateJobsBatch } from "./translator.js";
import {
  buildRecruiterOutreach,
  computeConversionFunnel,
  generateInterviewPrep,
  tailorResumeForJob,
} from "./conversion.js";
import { AutonomousSecurityAIGuard } from "./security_ai.js";
import { idbGet, idbSet } from "./storage.js";

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const RENDER_CHUNK_SIZE = 24;

// Cliente RPC para Web Workers com fallback automático na thread principal
function createWorkerClient(workerUrl, localFallbackHandler = null) {
  let worker = null;
  let workerBroken = false;
  try {
    worker = new Worker(workerUrl, { type: "module" });
  } catch {
    workerBroken = true;
  }

  const pending = new Map();
  let seq = 1;
  const listeners = new Set();

  if (worker) {
    worker.addEventListener("message", (event) => {
      const msg = event.data || {};
      for (const fn of listeners) fn(msg);
      if (msg.requestId && pending.has(msg.requestId)) {
        const { resolve, reject, timer } = pending.get(msg.requestId);
        if (msg.type === "EMBEDDINGS_STATUS" || msg.type === "EMBEDDINGS_PROGRESS") return;
        clearTimeout(timer);
        pending.delete(msg.requestId);
        if (msg.type === "WORKER_ERROR") reject(new Error(msg.error || "Worker error"));
        else resolve(msg);
      }
    });

    worker.addEventListener("error", (err) => {
      workerBroken = true;
      const error = new Error(err?.message || "Web Worker falhou ao carregar");
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      pending.clear();
    });
  }

  return {
    post(type, payload = {}) {
      if (workerBroken || !worker) {
        if (localFallbackHandler) return Promise.resolve(localFallbackHandler(type, payload));
        return Promise.reject(new Error("Worker indisponível"));
      }
      const requestId = seq++;
      return new Promise((resolve, reject) => {
        const timer = localFallbackHandler
          ? setTimeout(() => {
              if (!pending.has(requestId)) return;
              pending.delete(requestId);
              workerBroken = true;
              try {
                resolve(localFallbackHandler(type, payload));
              } catch (e) {
                reject(e);
              }
            }, 1500)
          : null;
        pending.set(requestId, { resolve, reject, timer });
        worker.postMessage({ type, requestId, payload });
      });
    },
    fire(type, payload = {}) {
      if (localFallbackHandler && (workerBroken || !worker)) {
        localFallbackHandler(type, payload);
        return;
      }
      if (worker) worker.postMessage({ type, payload });
    },
    onMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const fallbackIndex = new InvertedIndex();
let fallbackIndexedJobs = [];
const fallbackJobEmbeddings = new Map();
let fallbackCandidateEmbedding = null;

function runNlpFallback(type, payload = {}) {
  if (type === "PARSE_RESUME") {
    const profile = extractCanonicalProfile(payload.rawText, payload.filename, payload.pages);
    profile.ats_audit = evaluateAtsReadiness({
      rawText: payload.rawText,
      pages: profile.pages,
      wordCount: profile.word_count,
      skills: profile.skills,
      email: profile.email,
      phone: profile.phone,
      linkedin: profile.linkedin,
      github: profile.github,
    });
    return { type: "RESUME_PARSED", payload: { profile } };
  }
  if (type === "INDEX_JOBS") {
    fallbackIndexedJobs = (payload.jobs || []).map((j) => (j.canonical ? j : extractCanonicalJob(j)));
    fallbackIndex.build(fallbackIndexedJobs);
    return { type: "JOBS_INDEXED", payload: { indexedCount: fallbackIndex.size, indexTimeMs: 0 } };
  }
  if (type === "SET_EMBEDDINGS") {
    if (payload.candidateEmbedding) fallbackCandidateEmbedding = payload.candidateEmbedding;
    if (Array.isArray(payload.jobVectors)) {
      for (const item of payload.jobVectors) {
        if (item?.id && item?.vector) fallbackJobEmbeddings.set(String(item.id), item.vector);
      }
    }
    return { type: "EMBEDDINGS_STORED", payload: { count: fallbackJobEmbeddings.size } };
  }
  if (type === "CLEAR_CANDIDATE_EMBEDDING") {
    fallbackCandidateEmbedding = null;
    return { type: "CLEARED" };
  }
  if (type === "MATCH_JOBS") {
    const jobsSource = payload.jobs ? payload.jobs.map((j) => (j.canonical ? j : extractCanonicalJob(j))) : fallbackIndexedJobs;
    const useIndex = !payload.jobs && fallbackIndexedJobs.length > 0 ? fallbackIndex : null;
    const result = matchJobsHybrid({
      jobs: jobsSource,
      index: useIndex,
      candidateSkills: payload.candidateSkills || [],
      candidateText: payload.candidateText || "",
      candidateSeniority: payload.candidateSeniority || "Pleno",
      candidateYears: payload.candidateYears ?? null,
      candidateSector: payload.candidateSector || "",
      suggestedRoles: payload.suggestedRoles || [],
      userCountry: payload.userCountry || "Brasil",
      candidateEmbedding: fallbackCandidateEmbedding,
      jobEmbeddings: fallbackJobEmbeddings,
      weights: payload.weights,
      feedbackMap: payload.feedbackMap || {},
      filters: payload.filters || {},
    });
    return {
      type: "MATCH_RESULT",
      payload: {
        jobs: result.jobs,
        metrics: result.metrics,
        skillGaps: computeSkillGaps(result.jobs),
      },
    };
  }
  return { type: "NOOP" };
}

const nlpWorker = createWorkerClient(new URL("./workers/nlp.worker.js", import.meta.url), runNlpFallback);
let embeddingsWorker = null;
const securityGuard = new AutonomousSecurityAIGuard();

const state = {
  profile: null,
  resumeTextSnippet: "",
  skills: [],
  seniority: "Pleno",
  rawJobs: [],
  jobs: [],
  renderedCount: 0,
  skillGaps: [],
  courses: [],
  sources: {},
  fetchTelemetry: null,
  matchMetrics: null,
  externalLinks: [],
  tracker: {},
  trackerDates: {},
  feedbackMap: {}, // jobId -> { vote: 1|-1|0, clicked: bool }
  weights: { ...DEFAULT_WEIGHTS },
  activeJob: null,
  semanticStatus: "BM25 Léxico (Pronto)",
};

// Elementos DOM
const skillSuggestions = document.getElementById("skillSuggestions");
function populateSkillSuggestionsIdle() {
  if (!skillSuggestions || skillSuggestions.childElementCount > 0) return;
  skillSuggestions.innerHTML = CANONICAL_SKILLS.map((s) => `<option value="${s.replaceAll('"', "&quot;")}"></option>`).join("");
}
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(populateSkillSuggestionsIdle, { timeout: 1500 });
} else {
  setTimeout(populateSkillSuggestionsIdle, 250);
}

const dropzone = document.getElementById("dropzone");
const pdfInput = document.getElementById("pdfInput");
const chooseFileBtn = document.getElementById("chooseFileBtn");
const sampleBtn = document.getElementById("sampleBtn");
const downloadSampleBtn = document.getElementById("downloadSampleBtn");
const includeLiveCheck = document.getElementById("includeLiveCheck");
const deepSearchCheck = document.getElementById("deepSearchCheck");
const deepSearchBtn = document.getElementById("deepSearchBtn");
const statusBanner = document.getElementById("statusBanner");
const loader = document.getElementById("loader");
const uploadSection = document.getElementById("uploadSection");
const resultsSection = document.getElementById("resultsSection");
const newUploadBtn = document.getElementById("newUploadBtn");

const fileMeta = document.getElementById("fileMeta");
const atsScore = document.getElementById("atsScore");
const atsLevel = document.getElementById("atsLevel");
const atsBarFill = document.getElementById("atsBarFill");
const atsChecks = document.getElementById("atsChecks");
const senioritySelect = document.getElementById("senioritySelect");
const yearsValue = document.getElementById("yearsValue");
const rolesList = document.getElementById("rolesList");
const skillsList = document.getElementById("skillsList");
const skillsCount = document.getElementById("skillsCount");
const newSkillInput = document.getElementById("newSkillInput");
const addSkillBtn = document.getElementById("addSkillBtn");
const skillGapList = document.getElementById("skillGapList");
const coursesList = document.getElementById("coursesList");
const extraInfoList = document.getElementById("extraInfoList");
const externalLinks = document.getElementById("externalLinks");

const queryInput = document.getElementById("queryInput");
const modalityFilter = document.getElementById("modalityFilter");
const jobSeniorityFilter = document.getElementById("jobSeniorityFilter");
const languageFilter = document.getElementById("languageFilter");
const sectorFilter = document.getElementById("sectorFilter");
const locationFilter = document.getElementById("locationFilter");
const sourceFilter = document.getElementById("sourceFilter");
const minScoreFilter = document.getElementById("minScoreFilter");
const fraudFilter = document.getElementById("fraudFilter");
const recencyFilter = document.getElementById("recencyFilter");
const sortFilter = document.getElementById("sortFilter");
const trackerFilter = document.getElementById("trackerFilter");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const resultsSummary = document.getElementById("resultsSummary");
const sourcesStrip = document.getElementById("sourcesStrip");
const telemetryBar = document.getElementById("telemetryBar");
const conversionFunnelBar = document.getElementById("conversionFunnelBar");
const jobsGrid = document.getElementById("jobsGrid");
const listSentinel = document.getElementById("listSentinel");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const homeLiveStatus = document.getElementById("homeLiveStatus");
const homeRefreshBtn = document.getElementById("homeRefreshBtn");
const homeLiveGrid = document.getElementById("homeLiveGrid");
const resultsLiveStatus = document.getElementById("resultsLiveStatus");
const autoRefreshCheck = document.getElementById("autoRefreshCheck");
const manualRefreshBtn = document.getElementById("manualRefreshBtn");
const resetWeightsBtn = document.getElementById("resetWeightsBtn");
const securityGuardBtn = document.getElementById("securityGuardBtn");
const uiLanguageSelect = document.getElementById("uiLanguageSelect");
const toastEl = document.getElementById("toast");

// Job Modal
const jobModal = document.getElementById("jobModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalSource = document.getElementById("modalSource");
const modalTitle = document.getElementById("modalTitle");
const modalCompany = document.getElementById("modalCompany");
const modalMeta = document.getElementById("modalMeta");
const modalReason = document.getElementById("modalReason");
const modalBreakdown = document.getElementById("modalBreakdown");
const modalDescription = document.getElementById("modalDescription");
const modalMatchedSkills = document.getElementById("modalMatchedSkills");
const modalMissingSkills = document.getElementById("modalMissingSkills");
const modalPitch = document.getElementById("modalPitch");
const copyPitchBtn = document.getElementById("copyPitchBtn");
const modalConversionKit = document.getElementById("modalConversionKit");
const modalStatusSelect = document.getElementById("modalStatusSelect");
const modalApplyBtn = document.getElementById("modalApplyBtn");

// Compare Modal
const openCompareBtn = document.getElementById("openCompareBtn");
const compareModal = document.getElementById("compareModal");
const closeCompareBtn = document.getElementById("closeCompareBtn");
const compareTitleInput = document.getElementById("compareTitleInput");
const compareDescInput = document.getElementById("compareDescInput");
const runCompareBtn = document.getElementById("runCompareBtn");
const compareResult = document.getElementById("compareResult");

// Improve ATS Editor Modal
const openImproveBtn = document.getElementById("openImproveBtn");
const openImproveTopBtn = document.getElementById("openImproveTopBtn");
const improveModal = document.getElementById("improveModal");
const closeImproveBtn = document.getElementById("closeImproveBtn");
const improveBody = document.getElementById("improveBody");
const atsResumeEditor = document.getElementById("atsResumeEditor");
const editorLiveScore = document.getElementById("editorLiveScore");
const editorWordCount = document.getElementById("editorWordCount");
const editorSyncStatus = document.getElementById("editorSyncStatus");
const editorAutoFixBtn = document.getElementById("editorAutoFixBtn");
const editorLoadTemplateBtn = document.getElementById("editorLoadTemplateBtn");
const editorCopyBtn = document.getElementById("editorCopyBtn");
const editorPrintPdfBtn = document.getElementById("editorPrintPdfBtn");
const editorDownloadTxtBtn = document.getElementById("editorDownloadTxtBtn");
const applyEditedResumeBtn = document.getElementById("applyEditedResumeBtn");

let toastTimer = null;
let autoRefreshInterval = null;
let latestAtsPlan = null;
let editorDebounce = null;
let searchDebounce = null;
let listObserver = null;

function showError(msg) {
  statusBanner.textContent = msg;
  statusBanner.className = "status-banner error";
}

function clearError() {
  statusBanner.textContent = "";
  statusBanner.className = "status-banner hidden";
}

function setLoading(isLoading) {
  loader.classList.toggle("hidden", !isLoading);
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2800);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function initPersistedState() {
  const [tracker, trackerDates, feedbackMap, weights] = await Promise.all([
    idbGet("tracker", null),
    idbGet("tracker_dates", {}),
    idbGet("feedback", {}),
    idbGet("weights", null),
  ]);
  if (tracker) {
    state.tracker = tracker;
  } else {
    try {
      state.tracker = JSON.parse(localStorage.getItem("vagamatch_tracker") || "{}");
    } catch {
      state.tracker = {};
    }
  }
  state.trackerDates = trackerDates || {};
  state.feedbackMap = feedbackMap || {};
  state.weights = normalizeWeights(weights || DEFAULT_WEIGHTS);
}

function setJobStatus(jobId, status) {
  if (!status) {
    delete state.tracker[jobId];
    delete state.trackerDates[jobId];
  } else {
    state.tracker[jobId] = status;
    state.trackerDates[jobId] = Date.now();
  }
  idbSet("tracker", state.tracker);
  idbSet("tracker_dates", state.trackerDates);
  renderConversionFunnel();
  renderJobs({ resetScroll: false });
}

function getCurrentFilters() {
  return {
    query: queryInput ? queryInput.value.trim() : "",
    modality: modalityFilter ? modalityFilter.value : "",
    jobSeniority: jobSeniorityFilter ? jobSeniorityFilter.value : "",
    language: languageFilter ? languageFilter.value : "",
    sector: sectorFilter ? sectorFilter.value : "",
    location: locationFilter ? locationFilter.value.trim() : "",
    minScore: Number((minScoreFilter && minScoreFilter.value) || 0),
    fraudMode: (fraudFilter && fraudFilter.value) || "hide_scam",
    recency: (recencyFilter && recencyFilter.value) || "",
    sortBy: (sortFilter && sortFilter.value) || "match",
  };
}

/**
 * Lazy-load do Web Worker de Embeddings (Transformers.js MiniLM) apenas quando o currículo é analisado.
 */
function triggerLazyEmbeddings(candidateText, jobs) {
  if (!candidateText || !jobs.length) return;
  if (!embeddingsWorker) {
    embeddingsWorker = createWorkerClient(new URL("./workers/embeddings.worker.js", import.meta.url));
    embeddingsWorker.onMessage((msg) => {
      if (msg.type === "EMBEDDINGS_STATUS") {
        state.semanticStatus =
          msg.status === "loading_model"
            ? "⏳ Carregando MiniLM (WebAssembly)..."
            : `⏳ Gerando embeddings (${msg.total} vagas)...`;
        renderTelemetry();
      } else if (msg.type === "EMBEDDINGS_PROGRESS") {
        state.semanticStatus = `⏳ Embeddings: ${msg.completed}/${msg.total}`;
        renderTelemetry();
      } else if (msg.type === "EMBEDDINGS_FALLBACK") {
        state.semanticStatus = "BM25 Léxico (Fallback Offline)";
        renderTelemetry();
      }
    });
  }

  embeddingsWorker
    .post("COMPUTE_EMBEDDINGS", {
      candidateText: candidateText.slice(0, 1400),
      jobs: jobs.slice(0, 120).map((j) => ({
        id: j.id,
        title: j.title,
        skills: j.skills,
        description: j.description,
      })),
    })
    .then(async (res) => {
      if (res.type === "EMBEDDINGS_READY" && res.payload) {
        await nlpWorker.post("SET_EMBEDDINGS", res.payload);
        state.semanticStatus = `🧠 ${res.payload.model} + BM25`;
        await runMatchInWorker();
      }
    })
    .catch(() => {
      state.semanticStatus = "BM25 Léxico (Fallback)";
      renderTelemetry();
    });
}

async function runMatchInWorker() {
  const roles = suggestRoles(state.skills, state.resumeTextSnippet);
  if (state.profile) {
    state.profile.suggested_roles = roles;
    renderRoles();
  }

  const resp = await nlpWorker.post("MATCH_JOBS", {
    candidateSkills: state.skills,
    candidateText: state.resumeTextSnippet,
    candidateSeniority: state.seniority,
    candidateYears: (state.profile && state.profile.estimated_years) ?? null,
    candidateSector: (state.profile && state.profile.sector) || "",
    suggestedRoles: roles,
    userCountry: (state.profile && state.profile.country) || "Brasil",
    weights: state.weights,
    feedbackMap: state.feedbackMap,
    filters: getCurrentFilters(),
  });

  state.jobs = resp.payload.jobs || [];
  state.matchMetrics = resp.payload.metrics || null;
  state.skillGaps = resp.payload.skillGaps || [];
  state.courses = recommendCourses(state.skillGaps, state.skills, roles);
  state.externalLinks = buildExternalLinks(state.skills, roles, (state.profile && state.profile.country) || "Brasil");

  renderSkillGaps();
  renderCourses();
  renderExternalLinks();
  renderTelemetry();
  renderJobs({ resetScroll: true });
}

async function analyzeUpload({ file = null, useSample = false }) {
  clearError();
  setLoading(true);
  try {
    let rawText = "";
    let pages = 1;
    let filename = "curriculo_exemplo_mariana_silva.pdf";

    if (useSample) {
      const { SAMPLE_RESUME_LINES } = await import("./ats.js");
      rawText = SAMPLE_RESUME_LINES.join("\n");
    } else if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Formato inválido. Envie apenas arquivos .pdf.");
      }
      const headerSlice = await file.slice(0, 8).text();
      const fileVerdict = securityGuard.inspectUploadedFile(file.name, headerSlice);
      if (fileVerdict.blocked) {
        throw new Error("Arquivo bloqueado pelo motor autônomo de segurança (assinatura PDF inválida ou suspeita).");
      }
      filename = file.name;
      const extracted = await extractTextFromPdfFile(file);
      rawText = extracted.rawText;
      pages = extracted.pages;
    }

    // Parsing canônico em Web Worker
    const parsedResp = await nlpWorker.post("PARSE_RESUME", { rawText, filename, pages });
    const profile = parsedResp.payload.profile;

    state.profile = profile;
    state.resumeTextSnippet = rawText.slice(0, 15000);
    state.skills = [...profile.skills];
    state.seniority = profile.seniority;
    nlpWorker.fire("CLEAR_CANDIDATE_EMBEDDING");

    await runFetchAndMatchPipeline(false, { fastFirstPaint: true });
    renderProfile();

    uploadSection.classList.add("hidden");
    resultsSection.classList.remove("hidden");

    // Lazy-load do modelo MiniLM apenas após análise do currículo
    triggerLazyEmbeddings(state.resumeTextSnippet, state.rawJobs);
  } catch (err) {
    showError(err.message || "Erro ao analisar o currículo PDF.");
  } finally {
    setLoading(false);
  }
}

async function runFetchAndMatchPipeline(forceRefresh = false, { fastFirstPaint = false } = {}) {
  const prevIds = new Set(state.jobs.map((j) => j.id));
  if (forceRefresh && resultsLiveStatus) {
    resultsLiveStatus.textContent = "🔄 Atualizando vagas ao vivo...";
  }
  const roles = suggestRoles(state.skills, state.resumeTextSnippet);
  const forceLive = sourceFilter.value === "live" || includeLiveCheck.checked;

  // Se fastFirstPaint=true e inclui vagas ao vivo, carrega a base local imediatamente e sincroniza APIs ao vivo em seguida
  if (fastFirstPaint && forceLive && sourceFilter.value !== "live") {
    const localRes = await collectJobsWithTelemetry({
      sourceFilter: "local",
      includeLive: false,
      deepSearch: false,
    });
    state.rawJobs = localRes.jobs;
    state.sources = localRes.sources;
    state.fetchTelemetry = localRes.telemetry;
    await nlpWorker.post("INDEX_JOBS", { jobs: localRes.jobs });
    await runMatchInWorker();
    if (resultsLiveStatus) {
      resultsLiveStatus.textContent = "🔄 Sincronizando vagas ao vivo globais...";
    }
    // Dispara busca completa ao vivo sem travar a tela de resultados
    runFetchAndMatchPipeline(forceRefresh, { fastFirstPaint: false });
    return;
  }

  const { jobs, sources, telemetry } = await collectJobsWithTelemetry({
    sourceFilter: sourceFilter.value,
    primarySkill: state.skills[0] || "",
    includeLive: forceLive,
    deepSearch: Boolean(deepSearchCheck && deepSearchCheck.checked),
    skills: state.skills,
    suggestedRoles: roles,
    forceRefresh,
  });

  state.rawJobs = jobs;
  state.sources = sources;
  state.fetchTelemetry = telemetry;

  // Indexação invertida em Web Worker
  await nlpWorker.post("INDEX_JOBS", { jobs });
  await runMatchInWorker();

  if (resultsLiveStatus) {
    resultsLiveStatus.textContent = `🟢 Atualizado às ${new Date().toLocaleTimeString("pt-BR")}`;
  }
  if (forceRefresh && prevIds.size > 0) {
    const newCount = state.jobs.filter((j) => !prevIds.has(j.id)).length;
    showToast(newCount > 0 ? `🔄 +${newCount} nova(s) vaga(s) carregada(s)!` : "🟢 Vagas atualizadas com sucesso!");
  }
}

function triggerResearch({ immediate = false, refetch = false, forceRefresh = false } = {}) {
  clearTimeout(searchDebounce);
  const exec = () => {
    if (refetch) {
      runFetchAndMatchPipeline(forceRefresh);
    } else {
      runMatchInWorker();
    }
  };
  if (immediate) exec();
  else searchDebounce = setTimeout(exec, 180);
}

async function loadHomeLiveJobs(forceRefresh = false) {
  if (!homeLiveGrid) return;
  if (homeLiveStatus) homeLiveStatus.textContent = "🔄 Carregando vagas ao vivo...";

  const renderHomeCards = (jobs) => {
    const lang = getUiLang();
    homeLiveGrid.innerHTML = jobs
      .slice(0, 6)
      .map((raw) => {
        const j = getTranslatedJobView(raw, lang);
        return `
        <a class="mini-job-card" href="${escapeHtml(j.url)}" target="_blank" rel="noopener noreferrer">
          <span class="source-tag">${escapeHtml(j.source)}</span>
          <strong>${escapeHtml(j.title)}</strong>
          <span class="mini-job-meta">${escapeHtml(j.company)} · ${escapeHtml(j.location)} · ${escapeHtml(j.modality)}</span>
        </a>`;
      })
      .join("");
  };

  try {
    // Primeiro exibe base local instantaneamente (First Paint rápido)
    if (!forceRefresh && !homeLiveGrid.childElementCount) {
      const localOnly = await collectJobsWithTelemetry({ sourceFilter: "local", includeLive: false, deepSearch: false });
      if (localOnly.jobs.length) {
        renderHomeCards(localOnly.jobs);
        if (homeLiveStatus) homeLiveStatus.textContent = `⚡ ${localOnly.jobs.length} vagas locais · Sincronizando ao vivo...`;
      }
    }

    const { jobs } = await collectJobsWithTelemetry({
      sourceFilter: "all",
      primarySkill: "",
      includeLive: true,
      deepSearch: false,
      forceRefresh,
    });
    const ts = new Date().toLocaleTimeString("pt-BR");
    if (homeLiveStatus) homeLiveStatus.textContent = `🟢 ${jobs.length} vagas · ${ts}`;
    renderHomeCards(jobs);
    translateJobsBatch(jobs.slice(0, 6), getUiLang(), { includeDescription: false, limit: 6 }).then((changed) => {
      if (changed > 0) renderHomeCards(jobs);
    });
    if (forceRefresh) showToast("🟢 Vagas recentes atualizadas!");
  } catch {
    if (homeLiveStatus && !homeLiveGrid.childElementCount) {
      homeLiveStatus.textContent = "⚠️ Indisponível no momento";
    }
  }
}

function startAutoRefreshLoop() {
  clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    if (document.hidden) return;
    if (autoRefreshCheck && !autoRefreshCheck.checked) return;
    if (!resultsSection.classList.contains("hidden") && state.profile) {
      triggerResearch({ immediate: true, refetch: true, forceRefresh: true });
    } else {
      loadHomeLiveJobs(true);
    }
  }, AUTO_REFRESH_MS);
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;

  const contacts = [p.email, p.phone, p.linkedin, p.github].filter(Boolean);
  fileMeta.innerHTML = `
    <strong>${escapeHtml(p.filename)}</strong><br/>
    ${p.pages} página(s) · ${p.word_count} palavras · Setor: ${escapeHtml(p.sector || "Geral")}
    ${contacts.length ? `<br/>${contacts.map(escapeHtml).join(" · ")}` : ""}
  `;

  const ats = p.ats_audit || { score: 0, level: "—", checks: [] };
  atsScore.textContent = `${ats.score}`;
  atsLevel.textContent = ats.level;
  atsBarFill.style.width = `${ats.score}%`;
  atsChecks.innerHTML = (ats.checks || [])
    .map((c) => {
      const icon = c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
      return `<li><span>${icon}</span><div><strong>${escapeHtml(c.label)}</strong><span class="tip">${escapeHtml(c.tip)}</span></div></li>`;
    })
    .join("");

  if (senioritySelect) {
    senioritySelect.value = state.seniority;
  }
  yearsValue.textContent = p.estimated_years ? `~${p.estimated_years} ano(s)` : "Não informado";

  renderRoles();
  renderSkills();

  const extras = [...(p.languages || []), ...(p.education || [])];
  extraInfoList.innerHTML = extras.length
    ? extras.map((item) => `<span class="pill missing">${escapeHtml(item)}</span>`).join("")
    : `<span class="pill missing">Não especificado no PDF</span>`;
}

function renderRoles() {
  const roles = (state.profile && state.profile.suggested_roles) || [];
  rolesList.innerHTML = roles.map((r) => `<span class="pill role">${escapeHtml(r)}</span>`).join("");
}

function renderSkills() {
  skillsCount.textContent = String(state.skills.length);
  if (!state.skills.length) {
    skillsList.innerHTML = `<span class="pill missing">Nenhuma skill detectada — adicione abaixo</span>`;
    return;
  }
  skillsList.innerHTML = state.skills
    .map(
      (skill) => `
      <span class="pill">
        ${escapeHtml(skill)}
        <button type="button" class="pill-remove" data-remove-skill="${escapeHtml(skill)}" title="Remover">×</button>
      </span>`
    )
    .join("");
}

function renderSkillGaps() {
  if (!state.skillGaps.length) {
    skillGapList.innerHTML = `<span class="helper-text">Excelente! Você já cobre as principais skills das top vagas.</span>`;
    return;
  }
  skillGapList.innerHTML = state.skillGaps
    .map(
      (g) => `
      <button type="button" class="gap-item" data-add-gap="${escapeHtml(g.skill)}" title="Clique para declarar que domina esta skill">
        <span>+ Eu domino ${escapeHtml(g.skill)}</span>
        <span class="gap-pct">em ${g.demand_pct}% das top vagas</span>
      </button>`
    )
    .join("");
}

function renderCourses() {
  if (!coursesList) return;
  if (!state.courses.length) {
    coursesList.innerHTML = `<span class="helper-text">Nenhuma recomendação adicional no momento.</span>`;
    return;
  }
  coursesList.innerHTML = state.courses
    .map(
      (c) => `
      <a class="course-card" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">
        <div class="course-top">
          <span class="course-skill-tag">${escapeHtml(c.target_skill)}</span>
          <span class="course-cost-tag">${escapeHtml(c.cost || "Gratuito")}</span>
        </div>
        <strong class="course-title">${escapeHtml(c.title)}</strong>
        <span class="course-provider">${escapeHtml(c.provider)} ↗</span>
        <p class="course-why">${escapeHtml(c.why || "")}</p>
      </a>`
    )
    .join("");
}

function renderExternalLinks() {
  externalLinks.innerHTML = state.externalLinks
    .map(
      (link) => `
      <a class="external-link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(link.portal)}</span>
        <span>↗</span>
      </a>`
    )
    .join("");
}

function renderConversionFunnel() {
  if (!conversionFunnelBar) return;
  const f = computeConversionFunnel(state.tracker, state.trackerDates);
  const followUpText = f.followUpDueCount > 0 ? `${f.followUpDueCount} pendente(s) (≥5d)` : "Em dia";
  conversionFunnelBar.innerHTML = `
    <div class="telemetry-grid">
      <div class="telemetry-pill"><span>☆ Salvas</span><strong>${f.saved}</strong></div>
      <div class="telemetry-pill"><span>📨 Candidatadas</span><strong>${f.applied}</strong></div>
      <div class="telemetry-pill"><span>💬 Entrevistas / Propostas</span><strong>${f.interview + f.offer}</strong></div>
      <div class="telemetry-pill"><span>📈 Conversão</span><strong>${f.conversionRate}%</strong></div>
      <div class="telemetry-pill"><span>⏰ Follow-up</span><strong style="color:${f.followUpDueCount > 0 ? "#fbbf24" : "#86efac"};">${followUpText}</strong></div>
    </div>
  `;
}

function renderTelemetry() {
  renderConversionFunnel();
  if (!telemetryBar) return;
  const ft = state.fetchTelemetry;
  const mm = state.matchMetrics;
  if (!mm) {
    telemetryBar.innerHTML = "";
    return;
  }
  const q = mm.quality || {};
  const latBadges = ft && ft.apiLatencies
    ? Object.entries(ft.apiLatencies)
        .map(([src, info]) => `${escapeHtml(src)}: ${info.cached ? "cache" : `${info.latencyMs}ms`}`)
        .join(" · ")
    : "—";

  const w = mm.weights || DEFAULT_WEIGHTS;
  const weightsSummary = `Exata ${(w.exactSkills * 100).toFixed(0)}% · Grafo ${(w.relatedSkills * 100).toFixed(0)}% · Semântica ${(w.semantic * 100).toFixed(0)}% · Sen ${(w.seniority * 100).toFixed(0)}%`;

  telemetryBar.innerHTML = `
    <div class="telemetry-grid">
      <div class="telemetry-pill"><span>⚡ Busca/Índice</span><strong>${mm.searchTimeMs} ms</strong></div>
      <div class="telemetry-pill"><span>📚 Indexadas</span><strong>${mm.indexedCount}</strong></div>
      <div class="telemetry-pill"><span>🧹 Deduplicação</span><strong>${ft ? `${ft.duplicatesRemoved} (${ft.dedupRate}%)` : "0"}</strong></div>
      <div class="telemetry-pill"><span>🛡️ Falsas Filtradas</span><strong>${mm.filteredFakeCount ?? 0}</strong></div>
      <div class="telemetry-pill"><span>🎯 Precision@10</span><strong>${q.precisionAtK ?? 0}% ${q.isUserMeasured ? "(real)" : "(est.)"}</strong></div>
      <div class="telemetry-pill"><span>🤖 Semântica</span><strong>${escapeHtml(state.semanticStatus)}</strong></div>
    </div>
    <div class="telemetry-sub">
      <span><strong>Latência APIs:</strong> ${latBadges}</span>
      <span><strong>Pesos Ativos:</strong> ${weightsSummary}</span>
    </div>
  `;
}

function getFilteredJobs() {
  const tFilter = trackerFilter.value;
  if (!tFilter) return state.jobs;
  if (tFilter === "any_tracked") return state.jobs.filter((j) => Boolean(state.tracker[j.id]));
  return state.jobs.filter((j) => state.tracker[j.id] === tFilter);
}

function buildJobCardHtml(rawJob) {
  const job = getTranslatedJobView(rawJob, getUiLang());
  const currentStatus = state.tracker[job.id] || "";
  const fb = state.feedbackMap[job.id] || {};
  const band = job.score_band || { label: "Média", css: "score-mid" };
  const matchedHtml = (job.matched_skills || []).slice(0, 4).map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`).join("");
  const relatedHtml = (job.related_matches || [])
    .slice(0, 2)
    .map((r) => `<span class="pill related" title="Via ${escapeHtml(r.via)} (hop ${r.hop})">≈ ${escapeHtml(r.skill)}</span>`)
    .join("");
  const missingHtml = (job.missing_skills || [])
    .slice(0, 3)
    .map(
      (s) =>
        `<button type="button" class="pill missing master-skill-btn" data-master-skill="${escapeHtml(s)}" title="Clique se você domina esta skill">+ ${escapeHtml(s)}</button>`
    )
    .join("");

  return `
    <article class="job-card" data-job-id="${escapeHtml(job.id)}">
      <div class="job-card-top">
        <div>
          <span class="source-tag">${escapeHtml(job.source)} · ${escapeHtml((job.jobLanguage || "pt").toUpperCase())}</span>
          <h3 class="job-title">${escapeHtml(job.title)}</h3>
          <div class="job-company">${escapeHtml(job.company)}</div>
        </div>
        <div class="score-badge ${band.css}">
          ${job.match_score}%
          <small>${escapeHtml(band.label)}</small>
        </div>
      </div>
      <div class="job-meta-tags">
        ${job.isFresh48h ? `<span style="color:#4ade80;font-weight:600;">⚡ Recém-publicada</span>` : ""}
        ${job.isDirectAts ? `<span style="color:#38bdf8;">🏢 Canal Direto</span>` : ""}
        ${job.geo_label ? `<span>${escapeHtml(job.geo_label)}</span>` : ""}
        ${job.authenticity && job.authenticity.isSuspicious ? `<span title="${escapeHtml((job.authenticity.signals || []).map((s) => s.description || s).join(" · "))}" style="color:#fbbf24;">⚠️ ${escapeHtml(job.authenticity.status)} (Risco ${job.authenticity.riskScore}% · Conf. ${job.authenticity.confidence}%)</span>` : ""}
        ${job.authenticity?.ghostJob?.isGhost ? `<span title="${escapeHtml((job.authenticity.ghostJob.signals || []).join(" · "))}" style="color:#c084fc;">🕰️ ${escapeHtml(job.authenticity.ghostJob.status)}</span>` : ""}
        <span>📍 ${escapeHtml(job.location)}</span>
        <span>💼 ${escapeHtml(job.modality)}</span>
        <span>🎯 ${escapeHtml(job.seniority)}</span>
        <span>🏷️ ${escapeHtml(job.sector || "Geral")}</span>
        ${job.salary && job.salary !== "A combinar" ? `<span>💰 ${escapeHtml(job.salary)}</span>` : ""}
      </div>
      <p class="job-reason">${escapeHtml(job.match_reason)}</p>
      <div class="pill-list">${matchedHtml}${relatedHtml}${missingHtml}</div>
      <div class="job-card-footer">
        <div class="fb-group">
          <button type="button" class="btn-fb ${fb.vote === 1 ? "active-up" : ""}" data-fb-vote="1" data-fb-id="${escapeHtml(job.id)}" title="Boa recomendação (aumenta peso similar)">👍</button>
          <button type="button" class="btn-fb ${fb.vote === -1 ? "active-down" : ""}" data-fb-vote="-1" data-fb-id="${escapeHtml(job.id)}" title="Não relevante (ajusta pesos)">👎</button>
          <select class="select-input status-mini-select" data-status-id="${escapeHtml(job.id)}">
            <option value="" ${currentStatus === "" ? "selected" : ""}>${escapeHtml(t("cardTrackDefault"))}</option>
            <option value="Salva" ${currentStatus === "Salva" ? "selected" : ""}>${escapeHtml(t("trackerSaved"))}</option>
            <option value="Candidatada" ${currentStatus === "Candidatada" ? "selected" : ""}>${escapeHtml(t("trackerApplied"))}</option>
            <option value="Entrevista" ${currentStatus === "Entrevista" ? "selected" : ""}>${escapeHtml(t("trackerInterview"))}</option>
            <option value="Proposta" ${currentStatus === "Proposta" ? "selected" : ""}>${escapeHtml(t("trackerOffer"))}</option>
          </select>
        </div>
        <div class="card-actions-right">
          <button type="button" class="btn btn-secondary btn-small" data-detail-id="${escapeHtml(job.id)}">${escapeHtml(t("cardDetailsBtn"))}</button>
          <a class="btn btn-primary btn-small" data-apply-id="${escapeHtml(job.id)}" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("cardApplyBtn"))}</a>
        </div>
      </div>
    </article>`;
}

function syncListSentinel(totalVisible) {
  if (!listSentinel) return;
  const remaining = totalVisible - state.renderedCount;
  if (remaining > 0) {
    listSentinel.classList.remove("hidden");
    listSentinel.innerHTML = `<button type="button" class="btn btn-secondary btn-small" id="loadMoreBtn">Carregar mais vagas (${remaining} restantes)</button>`;
  } else {
    listSentinel.classList.add("hidden");
  }
}

function appendNextChunk() {
  const visibleJobs = getFilteredJobs();
  if (state.renderedCount >= visibleJobs.length) {
    syncListSentinel(visibleJobs.length);
    return;
  }
  const slice = visibleJobs.slice(state.renderedCount, state.renderedCount + RENDER_CHUNK_SIZE);
  jobsGrid.insertAdjacentHTML("beforeend", slice.map(buildJobCardHtml).join(""));
  state.renderedCount += slice.length;
  syncListSentinel(visibleJobs.length);
}

function renderJobs({ resetScroll = true } = {}) {
  const visibleJobs = getFilteredJobs();
  const liveTotal =
    (state.sources.remotive || 0) +
    (state.sources.arbeitnow || 0) +
    (state.sources.jobicy || 0) +
    (state.sources.remoteok || 0) +
    (state.sources.himalayas || 0) +
    (state.sources.workingnomads || 0) +
    (state.sources.themuse || 0) +
    (state.sources.ats_direct || 0) +
    (state.sources.github_br || 0);
  const trackedCount = Object.keys(state.tracker).length;
  const modeLabel = state.sources.deep_search ? "Busca Global" : "APIs Ao Vivo";

  resultsSummary.innerHTML = `
    <span>Exibindo <strong>${visibleJobs.length}</strong> vaga(s) · Rastreadas: <strong>${trackedCount}</strong></span>
    <span>Base Brasil: ${state.sources.local_br || 0} · ${modeLabel}: ${liveTotal}</span>
  `;

  if (sourcesStrip) {
    const sourceLabels = [
      ["Base Brasil", state.sources.local_br],
      ["Remotive", state.sources.remotive],
      ["Jobicy", state.sources.jobicy],
      ["Arbeitnow", state.sources.arbeitnow],
      ["RemoteOK", state.sources.remoteok],
      ["Himalayas", state.sources.himalayas],
      ["Working Nomads", state.sources.workingnomads],
      ["The Muse", state.sources.themuse],
      ["ATS Direto", state.sources.ats_direct],
      ["GitHub BR", state.sources.github_br],
    ].filter(([, count]) => Number(count || 0) > 0);
    sourcesStrip.innerHTML = sourceLabels
      .map(([label, count]) => `<span class="source-chip">${escapeHtml(label)}: <strong>${count}</strong></span>`)
      .join("");
  }

  if (!visibleJobs.length) {
    jobsGrid.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma vaga encontrada com os filtros atuais.</p>
        <p style="margin-top:6px;font-size:0.85rem;">Tente reduzir o match mínimo, limpar filtros ou adicionar habilidades.</p>
      </div>`;
    if (listSentinel) listSentinel.classList.add("hidden");
    return;
  }

  if (resetScroll) {
    jobsGrid.innerHTML = "";
    state.renderedCount = 0;
  } else {
    // Re-renderiza o mesmo volume já exibido para refletir status/feedbacks
    const targetCount = Math.max(state.renderedCount, RENDER_CHUNK_SIZE);
    jobsGrid.innerHTML = "";
    state.renderedCount = 0;
    const slice = visibleJobs.slice(0, targetCount);
    jobsGrid.insertAdjacentHTML("beforeend", slice.map(buildJobCardHtml).join(""));
    state.renderedCount = slice.length;
    syncListSentinel(visibleJobs.length);
  }
  if (state.renderedCount === 0) appendNextChunk();

  // Traduz automaticamente em segundo plano as vagas importadas em outro idioma
  translateJobsBatch(visibleJobs.slice(0, Math.max(state.renderedCount, 12)), getUiLang(), {
    includeDescription: false,
    limit: 12,
  }).then((changed) => {
    if (changed > 0 && state.jobs.length) {
      const targetCount = Math.max(state.renderedCount, RENDER_CHUNK_SIZE);
      const latestVisible = getFilteredJobs();
      jobsGrid.innerHTML = latestVisible.slice(0, targetCount).map(buildJobCardHtml).join("");
    }
  });

  if (listSentinel && !listObserver && typeof IntersectionObserver !== "undefined") {
    listObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) appendNextChunk();
      },
      { rootMargin: "220px" }
    );
    listObserver.observe(listSentinel);
  }
}

function renderBreakdownHtml(bd) {
  if (!bd) return "";
  const items = [
    ["Skills Exatas", bd.exactSkills ?? bd.skills ?? 0],
    ["Grafo Relacionado", bd.relatedSkills ?? 0],
    [bd.embedding !== null && bd.embedding !== undefined ? "Semântica (MiniLM+BM25)" : "Semântica (BM25)", bd.semantic ?? 0],
    ["Senioridade", bd.seniority ?? 0],
    ["Cargo & Setor", bd.roleSector ?? bd.role ?? 0],
    ["Filtros & Geo", bd.filtersPassed ? `OK (+${bd.geoBonus || 0})` : "Bloqueado"],
  ];
  return items
    .map(([label, val]) => {
      const numeric = typeof val === "number" ? val : 100;
      const display = typeof val === "number" ? `${val}%` : val;
      return `
        <div class="breakdown-item">
          <div class="breakdown-top"><span>${label}</span><strong>${display}</strong></div>
          <div class="ats-bar-track" style="margin-bottom:0">
            <div class="ats-bar-fill" style="width:${numeric}%"></div>
          </div>
        </div>`;
    })
    .join("");
}

function recordClick(jobId) {
  const cur = state.feedbackMap[jobId] || { vote: 0, clicked: false };
  state.feedbackMap[jobId] = { ...cur, clicked: true };
  idbSet("feedback", state.feedbackMap);
}

async function handleVote(jobId, voteValue) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;
  const prev = state.feedbackMap[jobId] || { vote: 0, clicked: false };
  const newVote = prev.vote === voteValue ? 0 : voteValue;
  state.feedbackMap[jobId] = { ...prev, vote: newVote };
  if (newVote !== 0) {
    state.weights = adaptWeightsFromFeedback(state.weights, job.score_breakdown, newVote);
    await idbSet("weights", state.weights);
  }
  await idbSet("feedback", state.feedbackMap);
  await runMatchInWorker();
  showToast(newVote === 1 ? "👍 Feedback registrado! Pesos ajustados." : newVote === -1 ? "👎 Feedback registrado! Ranking recalibrado." : "Feedback removido");
}

function declareMasteredSkill(skillName) {
  const canonical = resolveSkillAlias(skillName);
  if (!canonical) return;
  if (!state.skills.some((s) => s.toLowerCase() === canonical.toLowerCase())) {
    state.skills.push(canonical);
    renderSkills();
    runMatchInWorker();
    showToast(`✅ Skill "${canonical}" adicionada ao seu perfil!`);
  }
}

async function openJobModal(jobId) {
  const rawJob = state.jobs.find((j) => j.id === jobId);
  if (!rawJob) return;
  state.activeJob = rawJob;
  recordClick(jobId);

  const renderModalContent = (sourceJob) => {
    const job = getTranslatedJobView(sourceJob, getUiLang());
    const band = job.score_band || { label: t("bandMid") };
    modalSource.textContent = `${job.source} · ${job.match_score}% (${band.label})`;
    modalTitle.textContent = job.title;
    modalCompany.textContent = job.company;
    modalMeta.innerHTML = `
      ${job.geo_label ? `<span>${escapeHtml(job.geo_label)}</span>` : ""}
      <span>📍 ${escapeHtml(job.location)}</span>
      <span>💼 ${escapeHtml(job.modality)}</span>
      <span>🎯 ${escapeHtml(job.seniority)}</span>
      <span>🏷️ ${escapeHtml(job.sector || "Geral")}</span>
      <span>💰 ${escapeHtml(job.salary || "A combinar")}</span>
    `;
    modalReason.textContent = job.match_reason;
    const auth = job.authenticity;
    const authBoxHtml = auth
      ? `<div style="grid-column:1/-1;margin-top:6px;padding:10px 12px;border-radius:10px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.2);font-size:0.8rem;">
          <strong>🛡️ Auditoria Antifraude 2.0:</strong> ${escapeHtml(auth.status)} · Risco <strong>${auth.riskScore}/100</strong> · Confiança das evidências: <strong>${auth.confidence}%</strong><br/>
          <span>🏢 Empresa: ${escapeHtml(auth.companyAnalysis?.status || "—")} · 🕰️ Atividade: ${escapeHtml(auth.ghostJob?.status || "—")}</span>
          ${(auth.signals || []).length ? `<ul style="margin:6px 0 0 16px;color:#fcd34d;">${auth.signals.map((s) => `<li><strong>[${escapeHtml(s.severity)}]</strong> ${escapeHtml(s.description)} <em>(${escapeHtml(s.evidence)})</em></li>`).join("")}</ul>` : ""}
          ${(auth.recommendations || []).length ? `<div style="margin-top:6px;color:#93c5fd;"><strong>Recomendações:</strong> ${escapeHtml(auth.recommendations.join(" "))}</div>` : ""}
        </div>`
      : "";
    modalBreakdown.innerHTML = renderBreakdownHtml(job.score_breakdown) + authBoxHtml;
    modalDescription.innerHTML = highlightMatchedTerms(
      job.description || "Descrição não informada.",
      job.highlight_terms || []
    );
  };

  renderModalContent(rawJob);
  const matchedHtml = (rawJob.matched_skills || []).map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`).join("");
  const relatedHtml = (rawJob.related_matches || [])
    .map((r) => `<span class="pill related">≈ ${escapeHtml(r.skill)} (via ${escapeHtml(r.via)}, hop ${r.hop})</span>`)
    .join("");
  modalMatchedSkills.innerHTML = matchedHtml + relatedHtml || `<span class="pill missing">Nenhuma skill direta em comum</span>`;

  modalMissingSkills.innerHTML = (rawJob.missing_skills || []).length
    ? rawJob.missing_skills
        .map((s) => `<button type="button" class="pill missing master-skill-btn" data-master-skill="${escapeHtml(s)}">+ ${escapeHtml(s)}</button>`)
        .join("")
    : `<span class="pill matched">Você cobre todas as skills listadas!</span>`;

  modalPitch.textContent = rawJob.pitch_suggestion || "";
  copyPitchBtn.textContent = t("copyPitchBtn");
  modalStatusSelect.value = state.tracker[rawJob.id] || "";
  modalApplyBtn.href = rawJob.url || "#";

  if (modalConversionKit) {
    const tailored = tailorResumeForJob(state.resumeTextSnippet, rawJob, state.skills, state.seniority);
    const outreach = buildRecruiterOutreach(rawJob, state.seniority);
    const prep = generateInterviewPrep(rawJob);
    modalConversionKit.innerHTML = `
      <div class="pitch-box" style="margin-top:0;">
        <h4>✨ Adaptar Currículo para Esta Vaga (Tailored ATS)</h4>
        <p style="font-size:0.84rem;white-space:pre-line;">${escapeHtml(tailored.tailoredBlockText)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn btn-secondary btn-small" id="copyTailoredBtn">📋 Copiar Bloco Tailored</button>
          <button type="button" class="btn btn-primary btn-small" id="applyTailoredToEditorBtn">✨ Abrir no Editor ATS</button>
        </div>
      </div>
      <div class="pitch-box" style="margin-top:0;">
        <h4>🤝 Abordagem Direta ao Recrutador</h4>
        <p style="font-size:0.84rem;">${escapeHtml(outreach.connectionNote)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <a href="${escapeHtml(outreach.linkedinPeopleUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-small">🔎 Buscar Recrutador no LinkedIn ↗</a>
          <button type="button" class="btn btn-secondary btn-small" id="copyOutreachBtn">📋 Copiar Nota (300 chars)</button>
        </div>
      </div>
      <div class="pitch-box" style="margin-top:0;">
        <h4>🎤 Preparação de Entrevista (Perguntas Prováveis + STAR)</h4>
        <ul style="margin:6px 0 0 18px;font-size:0.83rem;line-height:1.5;">
          ${prep.map((q) => `<li><strong>[${escapeHtml(q.type)}]</strong> ${escapeHtml(q.question)}</li>`).join("")}
        </ul>
      </div>
    `;
    const copyTailoredBtn = document.getElementById("copyTailoredBtn");
    if (copyTailoredBtn) {
      copyTailoredBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(tailored.tailoredBlockText);
          copyTailoredBtn.textContent = "✓ Copiado!";
        } catch {
          showToast("Selecione e copie o texto acima");
        }
      });
    }
    const applyTailoredBtn = document.getElementById("applyTailoredToEditorBtn");
    if (applyTailoredBtn) {
      applyTailoredBtn.addEventListener("click", () => {
        closeModal();
        openImproveModal();
        if (atsResumeEditor) {
          atsResumeEditor.value = `${tailored.tailoredBlockText}\n\n---\n\n${atsResumeEditor.value}`;
          updateEditorStats(atsResumeEditor.value);
          refreshImprovePlan(atsResumeEditor.value, true);
        }
      });
    }
    const copyOutreachBtn = document.getElementById("copyOutreachBtn");
    if (copyOutreachBtn) {
      copyOutreachBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(outreach.connectionNote);
          copyOutreachBtn.textContent = "✓ Copiado!";
        } catch {
          showToast("Selecione e copie a nota acima");
        }
      });
    }
  }

  jobModal.classList.remove("hidden");

  translateJobsBatch([rawJob], getUiLang(), { includeDescription: true, limit: 1 }).then((changed) => {
    if (changed > 0 && state.activeJob && state.activeJob.id === rawJob.id) {
      renderModalContent(rawJob);
    }
  });
}

function closeModal() {
  jobModal.classList.add("hidden");
  state.activeJob = null;
}

function exportJobsCsv() {
  const rows = getFilteredJobs();
  if (!rows.length) return;
  const headers = ["Titulo", "Empresa", "Match%", "Faixa", "Modalidade", "Senioridade", "Setor", "Idioma", "Salario", "Status", "Fonte", "URL"];
  const csvLines = [headers.join(";")];
  for (const j of rows) {
    csvLines.push(
      [
        j.title,
        j.company,
        j.match_score,
        (j.score_band && j.score_band.label) || "",
        j.modality,
        j.seniority,
        j.sector || "",
        j.jobLanguage || "",
        j.salary || "",
        state.tracker[j.id] || "",
        j.source,
        j.url,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(";")
    );
  }
  const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vagapulse_ai_vagas.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function runCustomComparison() {
  const desc = compareDescInput.value.trim();
  if (desc.length < 20) {
    compareResult.classList.remove("hidden");
    compareResult.innerHTML = `<span style="color:#fca5a5;">Cole uma descrição de vaga com pelo menos 20 caracteres.</span>`;
    return;
  }
  const c = compareCustomJob({
    jobTitle: compareTitleInput.value.trim() || "Vaga Personalizada",
    jobDescription: desc,
    candidateSkills: state.skills,
    candidateText: state.resumeTextSnippet,
    candidateSeniority: state.seniority,
    candidateYears: (state.profile && state.profile.estimated_years) ?? null,
    candidateSector: (state.profile && state.profile.sector) || "",
    suggestedRoles: (state.profile && state.profile.suggested_roles) || [],
    userCountry: (state.profile && state.profile.country) || "Brasil",
  });

  const band = c.score_band || { label: "Média", css: "score-mid" };
  const compareMatchedHtml = (c.matched_skills || []).map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`).join("");
  const compareRelatedHtml = (c.related_skills || []).map((s) => `<span class="pill related">≈ ${escapeHtml(s)}</span>`).join("");
  const compareMissingHtml = (c.missing_skills || []).length
    ? c.missing_skills.map((s) => `<span class="pill missing">${escapeHtml(s)}</span>`).join("")
    : '<span class="pill matched">Nenhuma lacuna detectada!</span>';
  const compareTipsHtml = (c.optimization_tips || []).map((t) => `<li><span>💡</span><span>${escapeHtml(t)}</span></li>`).join("");

  compareResult.classList.remove("hidden");
  compareResult.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <strong>${escapeHtml(c.title)}</strong>
      <span class="score-badge ${band.css}">${c.match_score}% (${band.label})</span>
    </div>
    <div class="breakdown-grid">${renderBreakdownHtml(c.score_breakdown)}</div>
    <div>
      <span class="meta-label">Skills Compatíveis &amp; Relacionadas</span>
      <div class="pill-list">${compareMatchedHtml}${compareRelatedHtml}</div>
    </div>
    <div>
      <span class="meta-label">Skills Faltantes</span>
      <div class="pill-list">${compareMissingHtml}</div>
    </div>
    <div>
      <span class="meta-label">Dicas de Otimização ATS</span>
      <ul class="ats-checks" style="margin-top:6px;">${compareTipsHtml}</ul>
    </div>
  `;
}

function updateEditorStats(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (editorWordCount) editorWordCount.textContent = `${words} palavra(s) · ${String(text || "").length} caracteres`;
}

async function refreshImprovePlan(text, reparse = true) {
  if (!state.profile) return;
  let parsed = state.profile;
  if (reparse) {
    const res = await nlpWorker.post("PARSE_RESUME", {
      rawText: text,
      filename: state.profile.filename,
      pages: state.profile.pages,
    });
    parsed = res.payload.profile;
  }
  const plan = buildAtsImprovementPlan({
    rawText: text,
    pages: parsed.pages,
    wordCount: parsed.word_count,
    skills: reparse ? parsed.skills : state.skills,
    suggestedRoles: parsed.suggested_roles || [],
    seniority: state.seniority,
    email: parsed.email,
    phone: parsed.phone,
    linkedin: parsed.linkedin,
    github: parsed.github,
    skillGaps: state.skillGaps || [],
  });
  plan.detected_skills = parsed.skills || state.skills;
  latestAtsPlan = plan;

  if (editorLiveScore) {
    editorLiveScore.textContent = `ATS: ${plan.current_score}/100 (${plan.current_level}) ➜ Meta: ${plan.projected_score}/100`;
    editorLiveScore.className =
      "editor-score-pill " + (plan.current_score >= 85 ? "score-high" : plan.current_score >= 65 ? "score-mid" : "score-low");
  }

  const prioClass = (p) => (p === "Alta" ? "prio-high" : p === "Média" ? "prio-mid" : "prio-low");
  const modsHtml = (plan.modifications || [])
    .map((m, idx) => {
      const foundHtml = (m.found_items || []).length
        ? `<div class="pill-list" style="margin:6px 0;">${m.found_items
            .map((it) => `<button type="button" class="pill missing jump-item" data-jump-text="${escapeHtml(it)}">🔍 ${escapeHtml(it)}</button>`)
            .join("")}</div>`
        : "";
      return `
        <div class="mod-card">
          <div class="mod-card-header">
            <strong>${idx + 1}. ${escapeHtml(m.category)}</strong>
            <span class="prio-badge ${prioClass(m.priority)}">Prioridade ${escapeHtml(m.priority)} · +${m.impact_points} pts</span>
          </div>
          <p class="mod-issue">${escapeHtml(m.issue)}</p>
          ${foundHtml}
          <p class="mod-action"><strong>O que fazer:</strong> ${escapeHtml(m.action)}</p>
          <div class="before-after-grid">
            <div class="ba-box ba-before"><span class="meta-label">❌ Antes</span><p>${escapeHtml(m.before_example)}</p></div>
            <div class="ba-box ba-after"><span class="meta-label">✅ Depois (ATS)</span><p>${escapeHtml(m.after_example)}</p></div>
          </div>
        </div>`;
    })
    .join("");

  improveBody.innerHTML = `
    <div class="improve-summary">
      <div><span class="meta-label">Score ATS Atual</span><div class="improve-score-val">${plan.current_score}/100 <small>(${escapeHtml(plan.current_level)})</small></div></div>
      <div class="improve-arrow">➜</div>
      <div><span class="meta-label">Projetado</span><div class="improve-score-val projected">${plan.projected_score}/100</div></div>
      <div><span class="meta-label">Melhorias</span><div class="improve-score-val">${plan.total_modifications}</div></div>
    </div>
    <h4>Melhorias Necessárias para Atender ATS</h4>
    <div class="mod-list">${modsHtml}</div>
  `;
  if (editorSyncStatus) editorSyncStatus.textContent = "Diagnóstico ATS atualizado em tempo real";
}

function openImproveModal() {
  if (!state.profile || !state.resumeTextSnippet) return;
  improveModal.classList.remove("hidden");
  if (atsResumeEditor) {
    atsResumeEditor.value = state.resumeTextSnippet;
    updateEditorStats(atsResumeEditor.value);
  }
  refreshImprovePlan(state.resumeTextSnippet, false);
}

function applyQuickAutoFixes() {
  if (!atsResumeEditor) return;
  let txt = atsResumeEditor.value;
  txt = txt.replace(/\[(\d{2})(\d{5})(\d{4})\b/g, "($1) $2-$3");
  txt = txt.replace(/\b(\d{2})(\d{5})(\d{4})\b/g, "($1) $2-$3");
  txt = txt.replace(/([•\*\-])\s*[•\*\-]\s+/g, "$1 ");
  txt = txt.replace(/[ \t]{2,}/g, " ");
  atsResumeEditor.value = txt;
  updateEditorStats(txt);
  refreshImprovePlan(txt, true);
}

function printResumeAsPdf() {
  if (!atsResumeEditor) return;
  const content = escapeHtml(atsResumeEditor.value).replaceAll("\n", "<br/>");
  const win = window.open("", "_blank", "width=850,height=950");
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Currículo Otimizado ATS</title>` +
      `<style>body{font-family:Arial,Helvetica,sans-serif;max-width:780px;margin:32px auto;padding:0 24px;line-height:1.5;color:#111827;font-size:13px;}@media print{body{margin:0;}}</style>` +
      `</head><body><div>${content}</div><script>window.onload=function(){window.print();};</script></body></html>`
  );
  win.document.close();
}

// Eventos de Upload e Interface
chooseFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  pdfInput.click();
});
if (sampleBtn) {
  sampleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    analyzeUpload({ useSample: true });
  });
}
if (downloadSampleBtn) {
  downloadSampleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const blob = buildSamplePdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "curriculo_exemplo_mariana_silva.pdf";
    a.click();
    URL.revokeObjectURL(url);
  });
}
dropzone.addEventListener("click", (e) => {
  if (e.target.closest("button") || e.target.closest("a") || e.target.closest("label")) return;
  pdfInput.click();
});
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    pdfInput.click();
  }
});
pdfInput.addEventListener("change", () => {
  const file = pdfInput.files && pdfInput.files[0];
  if (file) analyzeUpload({ file });
});
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) analyzeUpload({ file });
});

newUploadBtn.addEventListener("click", () => {
  resultsSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");
  pdfInput.value = "";
  queryInput.value = "";
  modalityFilter.value = "";
  jobSeniorityFilter.value = "";
  if (languageFilter) languageFilter.value = "";
  if (sectorFilter) sectorFilter.value = "";
  if (locationFilter) locationFilter.value = "";
  sourceFilter.value = "all";
  minScoreFilter.value = "0";
  if (fraudFilter) fraudFilter.value = "hide_scam";
  if (recencyFilter) recencyFilter.value = "";
  sortFilter.value = "match";
  trackerFilter.value = "";
  compareTitleInput.value = "";
  compareDescInput.value = "";
  compareResult.innerHTML = "";
  compareResult.classList.add("hidden");
  clearError();
});

skillsList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-skill]");
  if (!btn) return;
  const skill = btn.getAttribute("data-remove-skill");
  state.skills = state.skills.filter((s) => s !== skill);
  renderSkills();
  triggerResearch({ immediate: true, refetch: false });
});

skillGapList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add-gap]");
  if (!btn) return;
  declareMasteredSkill(btn.getAttribute("data-add-gap"));
});

function addSkillFromInput() {
  const value = newSkillInput.value.trim();
  if (!value) return;
  declareMasteredSkill(value);
  newSkillInput.value = "";
}
addSkillBtn.addEventListener("click", addSkillFromInput);
newSkillInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addSkillFromInput();
  }
});

senioritySelect.addEventListener("change", () => {
  state.seniority = senioritySelect.value;
  triggerResearch({ immediate: true, refetch: false });
});

// Filtros duros + Índice invertido sub-10ms (sem refetch desnecessário)
queryInput.addEventListener("input", () => {
  const verdict = securityGuard.inspectValue("Busca Textual", queryInput.value);
  if (verdict.blocked) {
    showToast("🛡️ Entrada suspeita bloqueada e registrada no documento de segurança.");
    queryInput.value = "";
    return;
  }
  triggerResearch({ immediate: false, refetch: false });
});
modalityFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
jobSeniorityFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
if (languageFilter) languageFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
if (sectorFilter) sectorFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
if (locationFilter) locationFilter.addEventListener("input", () => triggerResearch({ immediate: false, refetch: false }));
minScoreFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
if (fraudFilter) fraudFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
if (recencyFilter) recencyFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
sortFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: false }));
sourceFilter.addEventListener("change", () => triggerResearch({ immediate: true, refetch: true }));
trackerFilter.addEventListener("change", () => renderJobs({ resetScroll: true }));

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", () => {
    queryInput.value = "";
    modalityFilter.value = "";
    jobSeniorityFilter.value = "";
    if (languageFilter) languageFilter.value = "";
    if (sectorFilter) sectorFilter.value = "";
    if (locationFilter) locationFilter.value = "";
    sourceFilter.value = "all";
    minScoreFilter.value = "0";
    if (fraudFilter) fraudFilter.value = "hide_scam";
    sortFilter.value = "match";
    trackerFilter.value = "";
    triggerResearch({ immediate: true, refetch: false });
    showToast("Filtros limpos");
  });
}

if (resetWeightsBtn) {
  resetWeightsBtn.addEventListener("click", async () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    await idbSet("weights", state.weights);
    await runMatchInWorker();
    showToast("Pesos do ranking restaurados ao padrão");
  });
}

exportCsvBtn.addEventListener("click", () => {
  exportJobsCsv();
  showToast("Exportação CSV iniciada");
});

if (deepSearchBtn) {
  deepSearchBtn.addEventListener("click", () => {
    if (includeLiveCheck) includeLiveCheck.checked = true;
    if (deepSearchCheck) deepSearchCheck.checked = true;
    if (sourceFilter.value === "local") sourceFilter.value = "all";
    showToast("Executando Busca Profunda na internet...");
    triggerResearch({ immediate: true, refetch: true, forceRefresh: true });
  });
}

jobsGrid.addEventListener("click", (e) => {
  const detailBtn = e.target.closest("[data-detail-id]");
  if (detailBtn) {
    openJobModal(detailBtn.getAttribute("data-detail-id"));
    return;
  }
  const fbBtn = e.target.closest("[data-fb-vote]");
  if (fbBtn) {
    handleVote(fbBtn.getAttribute("data-fb-id"), Number(fbBtn.getAttribute("data-fb-vote")));
    return;
  }
  const masterBtn = e.target.closest("[data-master-skill]");
  if (masterBtn) {
    declareMasteredSkill(masterBtn.getAttribute("data-master-skill"));
    return;
  }
  const applyLink = e.target.closest("[data-apply-id]");
  if (applyLink) {
    recordClick(applyLink.getAttribute("data-apply-id"));
  }
});

jobsGrid.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-status-id]");
  if (sel) setJobStatus(sel.getAttribute("data-status-id"), sel.value);
});

if (listSentinel) {
  listSentinel.addEventListener("click", (e) => {
    if (e.target.closest("#loadMoreBtn")) appendNextChunk();
  });
}

closeModalBtn.addEventListener("click", closeModal);
jobModal.addEventListener("click", (e) => {
  if (e.target === jobModal) closeModal();
});
modalStatusSelect.addEventListener("change", () => {
  if (state.activeJob) setJobStatus(state.activeJob.id, modalStatusSelect.value);
});
modalMissingSkills.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-master-skill]");
  if (btn) declareMasteredSkill(btn.getAttribute("data-master-skill"));
});
copyPitchBtn.addEventListener("click", async () => {
  if (!modalPitch.textContent) return;
  try {
    await navigator.clipboard.writeText(modalPitch.textContent);
    copyPitchBtn.textContent = "✓ Copiado!";
  } catch {
    copyPitchBtn.textContent = "Selecione e copie o texto";
  }
});

openCompareBtn.addEventListener("click", () => compareModal.classList.remove("hidden"));
closeCompareBtn.addEventListener("click", () => compareModal.classList.add("hidden"));
compareModal.addEventListener("click", (e) => {
  if (e.target === compareModal) compareModal.classList.add("hidden");
});
runCompareBtn.addEventListener("click", runCustomComparison);

if (openImproveBtn) openImproveBtn.addEventListener("click", openImproveModal);
if (openImproveTopBtn) openImproveTopBtn.addEventListener("click", openImproveModal);
if (closeImproveBtn) closeImproveBtn.addEventListener("click", () => improveModal.classList.add("hidden"));
if (improveModal) {
  improveModal.addEventListener("click", (e) => {
    if (e.target === improveModal) improveModal.classList.add("hidden");
  });
}
if (atsResumeEditor) {
  atsResumeEditor.addEventListener("input", () => {
    const txt = atsResumeEditor.value;
    updateEditorStats(txt);
    clearTimeout(editorDebounce);
    editorDebounce = setTimeout(() => {
      if (txt.trim().length >= 30) refreshImprovePlan(txt, true);
    }, 280);
  });
}
if (editorAutoFixBtn) {
  editorAutoFixBtn.addEventListener("click", () => {
    applyQuickAutoFixes();
    showToast("Correções automáticas aplicadas!");
  });
}
if (improveBody) {
  improveBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-jump-text]");
    if (!btn || !atsResumeEditor) return;
    const needle = btn.getAttribute("data-jump-text") || "";
    const pos = atsResumeEditor.value.toLowerCase().indexOf(needle.toLowerCase());
    if (pos >= 0) {
      atsResumeEditor.focus();
      atsResumeEditor.setSelectionRange(pos, pos + needle.length);
      showToast("Trecho selecionado no editor");
    } else {
      showToast("Trecho já corrigido ou não encontrado literalmente");
    }
  });
}
if (editorLoadTemplateBtn) {
  editorLoadTemplateBtn.addEventListener("click", () => {
    if (!latestAtsPlan || !latestAtsPlan.ats_template || !atsResumeEditor) return;
    atsResumeEditor.value = latestAtsPlan.ats_template;
    updateEditorStats(atsResumeEditor.value);
    refreshImprovePlan(atsResumeEditor.value, true);
  });
}
if (editorCopyBtn) {
  editorCopyBtn.addEventListener("click", async () => {
    if (!atsResumeEditor) return;
    try {
      await navigator.clipboard.writeText(atsResumeEditor.value);
      editorCopyBtn.textContent = "✓ Copiado!";
      setTimeout(() => {
        editorCopyBtn.textContent = "📋 Copiar";
      }, 1800);
    } catch {
      editorCopyBtn.textContent = "Ctrl+C no texto";
    }
  });
}
if (editorPrintPdfBtn) editorPrintPdfBtn.addEventListener("click", printResumeAsPdf);
if (editorDownloadTxtBtn) {
  editorDownloadTxtBtn.addEventListener("click", () => {
    if (!atsResumeEditor) return;
    const blob = new Blob([atsResumeEditor.value], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "curriculo_otimizado_ats.txt";
    a.click();
    URL.revokeObjectURL(url);
  });
}
if (applyEditedResumeBtn) {
  applyEditedResumeBtn.addEventListener("click", async () => {
    if (!atsResumeEditor || !state.profile) return;
    const editedText = atsResumeEditor.value.trim();
    if (!editedText) return;
    state.resumeTextSnippet = editedText;
    if (latestAtsPlan) {
      if (Array.isArray(latestAtsPlan.detected_skills) && latestAtsPlan.detected_skills.length) {
        state.skills = [...latestAtsPlan.detected_skills];
        renderSkills();
      }
      state.profile.ats_audit.score = latestAtsPlan.current_score;
      state.profile.ats_audit.level = latestAtsPlan.current_level;
      atsScore.textContent = `${latestAtsPlan.current_score}`;
      atsLevel.textContent = latestAtsPlan.current_level;
      atsBarFill.style.width = `${latestAtsPlan.current_score}%`;
    }
    improveModal.classList.add("hidden");
    await runMatchInWorker();
    triggerLazyEmbeddings(state.resumeTextSnippet, state.rawJobs);
    showToast("Currículo editado aplicado à busca de vagas!");
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!jobModal.classList.contains("hidden")) closeModal();
    if (!compareModal.classList.contains("hidden")) compareModal.classList.add("hidden");
    if (improveModal && !improveModal.classList.contains("hidden")) improveModal.classList.add("hidden");
  }
});

if (homeRefreshBtn) homeRefreshBtn.addEventListener("click", () => loadHomeLiveJobs(true));
if (manualRefreshBtn) manualRefreshBtn.addEventListener("click", () => triggerResearch({ immediate: true, refetch: true, forceRefresh: true }));
if (autoRefreshCheck) {
  autoRefreshCheck.addEventListener("change", () => {
    showToast(autoRefreshCheck.checked ? "🟢 Auto-atualização ativada (a cada 5 min)" : "⏸ Auto-atualização pausada");
  });
}

function updateSecurityGuardBadge(stats) {
  if (!securityGuardBtn) return;
  const total = stats?.total || 0;
  securityGuardBtn.textContent = total > 0 ? t("guardAlerts", { n: total }) : t("guardActiveZero");
}

securityGuard.onChange(updateSecurityGuardBadge);
if (securityGuardBtn) {
  securityGuardBtn.addEventListener("click", () => {
    securityGuard.downloadSecurityDocument();
    showToast("📄 Documento de auditoria de segurança baixado!");
  });
}

if (uiLanguageSelect) {
  uiLanguageSelect.innerHTML = SUPPORTED_LANGUAGES.map(
    (l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.label)}</option>`
  ).join("");
  uiLanguageSelect.addEventListener("change", async () => {
    const chosen = await applyUiTranslationsAsync(uiLanguageSelect.value);
    idbSet("ui_lang", chosen);
    updateSecurityGuardBadge(securityGuard.getStats());
    loadHomeLiveJobs(false);
    if (state.profile) {
      renderTelemetry();
      renderJobs({ resetScroll: false });
    }
  });
}

// Inicialização em paralelo para tempo de boot mínimo
const [, savedLang] = await Promise.all([
  initPersistedState(),
  idbGet("ui_lang", "pt"),
  securityGuard.init(),
]);
if (uiLanguageSelect) uiLanguageSelect.value = savedLang;
await applyUiTranslationsAsync(savedLang);
updateSecurityGuardBadge(securityGuard.getStats());
loadHomeLiveJobs(false);
startAutoRefreshLoop();
