/**
 * VagaPulse AI — Fetcher Paralelo com Pool de Concorrência, Retry/Backoff Exponencial e Cache TTL
 */

import { extractCanonicalJob, normalizeText } from "./nlp.js";
import { deduplicateJobs } from "./dedup.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos por fonte
const sourceCache = new Map(); // cacheKey -> { ts, ttlMs, data }

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa tarefas assíncronas com limite rígido de concorrência (4-6 requisições simultâneas).
 */
export async function runWithConcurrencyPool(tasks, concurrency = 5) {
  const results = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Fetch com timeout, retry automático e backoff exponencial com jitter.
 */
export async function fetchJsonWithRetry(url, { timeoutMs = 5500, retries = 2, baseDelayMs = 350 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const jitter = Math.floor(Math.random() * 140);
        await delay(baseDelayMs * Math.pow(2, attempt) + jitter);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Fetch failed");
}

function getCachedSource(key, ttlMs = DEFAULT_TTL_MS) {
  const hit = sourceCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts < (hit.ttlMs || ttlMs)) return hit.data;
  return null;
}

function setCachedSource(key, data, ttlMs = DEFAULT_TTL_MS) {
  sourceCache.set(key, { ts: Date.now(), ttlMs, data });
}

export function stripHtml(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDeepSearchTerms(skills = [], roles = [], primarySkill = "") {
  const skillMap = {
    "Segurança da Informação": "security",
    "Threat Hunting / YARA": "cybersecurity",
    "LLM / IA Generativa": "ai",
    "Machine Learning": "machine learning",
    "QA / Testes": "qa",
    "Scrum / Ágil": "agile",
  };
  const terms = [];
  for (const s of skills || []) {
    const mapped = String(skillMap[s] || s).replace(/[^a-zA-Z0-9\s.+]/g, "").trim();
    if (mapped && !terms.some((t) => t.toLowerCase() === mapped.toLowerCase())) terms.push(mapped);
    if (terms.length >= 4) break;
  }
  const roleKeywords = [
    ["ciberseguran", "cybersecurity"],
    ["cientista de dados", "data science"],
    ["engenheiro de dados", "data engineer"],
    ["devops", "devops"],
    ["full stack", "full stack"],
    ["backend", "backend"],
    ["frontend", "frontend"],
  ];
  for (const r of roles || []) {
    const nr = normalizeText(r);
    for (const [k, term] of roleKeywords) {
      if (nr.includes(k) && !terms.some((t) => t.toLowerCase() === term)) {
        terms.push(term);
        break;
      }
    }
  }
  if (!terms.length && primarySkill) {
    const safe = String(primarySkill).replace(/[^a-zA-Z0-9\s.+]/g, "").trim();
    if (safe) terms.push(safe);
  }
  return terms.length ? terms.slice(0, 4) : [""];
}

async function fetchLocalJobs() {
  const cached = getCachedSource("local", 30 * 60 * 1000);
  if (cached) return { source: "Base Brasil", jobs: cached, latencyMs: 0, cached: true, ok: true };
  const t0 = performance.now();
  const data = await fetchJsonWithRetry("./data/local_jobs.json", { timeoutMs: 4000, retries: 1 });
  const canonical = (Array.isArray(data) ? data : []).map(extractCanonicalJob);
  setCachedSource("local", canonical, 30 * 60 * 1000);
  return { source: "Base Brasil", jobs: canonical, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
}

async function fetchRemotive(term = "") {
  const safe = String(term || "").replace(/[^a-zA-Z0-9\s.+]/g, "").trim();
  const key = `remotive:${safe.toLowerCase()}`;
  const cached = getCachedSource(key);
  if (cached) return { source: "Remotive", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const q = safe ? `&search=${encodeURIComponent(safe)}` : "";
    let payload = await fetchJsonWithRetry(`https://remotive.com/api/remote-jobs?limit=25${q}`);
    if (!(payload.jobs || []).length && safe) {
      payload = await fetchJsonWithRetry("https://remotive.com/api/remote-jobs?limit=25");
    }
    const jobs = (payload.jobs || []).slice(0, 25).map((item) => {
      const desc = stripHtml(item.description);
      return extractCanonicalJob({
        id: `remotive-${item.id}`,
        title: item.title || "Vaga Remota",
        company: item.company_name || "Empresa Internacional",
        location: item.candidate_required_location || "Remoto Global",
        modality: "Remoto",
        salary: item.salary || "A combinar",
        skills: item.tags || [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.url || "https://remotive.com",
        source: "Remotive (Ao Vivo)",
        posted_at: String(item.publication_date || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "Remotive", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Remotive", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchArbeitnow() {
  const key = "arbeitnow";
  const cached = getCachedSource(key);
  if (cached) return { source: "Arbeitnow", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://www.arbeitnow.com/api/job-board-api");
    const jobs = (payload.data || []).slice(0, 30).map((item, idx) => {
      const desc = stripHtml(item.description);
      return extractCanonicalJob({
        id: `arbeitnow-${item.slug || idx}`,
        title: item.title || "Tech Job",
        company: item.company_name || "Empresa",
        location: item.location || (item.remote ? "Remoto" : "Internacional"),
        modality: item.remote ? "Remoto" : "Presencial",
        salary: "A combinar",
        skills: item.tags || [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.url || "https://www.arbeitnow.com",
        source: "Arbeitnow (Ao Vivo)",
        posted_at: item.created_at ? new Date(item.created_at * 1000).toISOString().slice(0, 10) : "",
      });
    });
    setCachedSource(key, jobs);
    return { source: "Arbeitnow", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Arbeitnow", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchJobicy(tag = "") {
  const safe = String(tag || "").replace(/[^a-zA-Z0-9\s-]/g, "").trim().toLowerCase();
  const key = `jobicy:${safe}`;
  const cached = getCachedSource(key);
  if (cached) return { source: "Jobicy", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const q = safe ? `&tag=${encodeURIComponent(safe)}` : "";
    let payload = await fetchJsonWithRetry(`https://jobicy.com/api/v2/remote-jobs?count=20${q}`);
    if (!(payload.jobs || []).length && safe) {
      payload = await fetchJsonWithRetry("https://jobicy.com/api/v2/remote-jobs?count=20");
    }
    const jobs = (payload.jobs || []).slice(0, 20).map((item) => {
      const title = stripHtml(item.jobTitle || "Vaga Remota");
      const desc = stripHtml(item.jobDescription || item.jobExcerpt || "");
      return extractCanonicalJob({
        id: `jobicy-${item.id}`,
        title,
        company: stripHtml(item.companyName || "Empresa"),
        location: stripHtml(item.jobGeo || "Remoto Global"),
        modality: "Remoto",
        seniority: `${title} ${item.jobLevel || ""}`,
        salary: "A combinar",
        skills: item.jobIndustry || [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.url || "https://jobicy.com",
        source: "Jobicy (Ao Vivo)",
        posted_at: String(item.pubDate || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "Jobicy", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Jobicy", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchRemoteOk() {
  const key = "remoteok";
  const cached = getCachedSource(key);
  if (cached) return { source: "RemoteOK", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://remoteok.com/api");
    const items = (Array.isArray(payload) ? payload : []).filter((x) => x && x.position).slice(0, 35);
    const jobs = items.map((item) => {
      const title = String(item.position || "Remote Tech Job").trim();
      const desc = stripHtml(item.description || "");
      const sMin = Number(item.salary_min || 0);
      const sMax = Number(item.salary_max || 0);
      const salary =
        sMin && sMax
          ? `USD ${sMin.toLocaleString("en-US")} - ${sMax.toLocaleString("en-US")}`
          : sMax
            ? `USD ${sMax.toLocaleString("en-US")}`
            : "A combinar";
      return extractCanonicalJob({
        id: `remoteok-${item.id}`,
        title,
        company: String(item.company || "Empresa Internacional"),
        location: String(item.location || "Remoto Global"),
        modality: "Remoto",
        salary,
        skills: item.tags || [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.apply_url || item.url || "https://remoteok.com",
        source: "RemoteOK (Ao Vivo)",
        posted_at: String(item.date || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "RemoteOK", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "RemoteOK", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchGitHubBr(repo = "backend-br/vagas") {
  const key = `gh:${repo}`;
  const cached = getCachedSource(key);
  if (cached) return { source: `GitHub (${repo.split("/")[0]})`, jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const issues = await fetchJsonWithRetry(`https://api.github.com/repos/${repo}/issues?state=open&per_page=20`);
    if (!Array.isArray(issues)) {
      return { source: `GitHub (${repo.split("/")[0]})`, jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
    }
    const jobs = issues
      .filter((it) => !it.pull_request)
      .map((item) => {
        const title = String(item.title || "").trim();
        const body = stripHtml(item.body || "");
        const labels = (item.labels || []).map((l) => l.name || "");
        const norm = normalizeText(`${labels.join(" ")} ${title}`);
        const compM = title.match(/(?:\bna\b|\bno\b|@)\s+([^|\-\[\]]{2,45})$/i);
        const company = compM ? compM[1].trim() : `Comunidade ${repo.split("/")[0]}`;
        const modality = norm.includes("remoto") || norm.includes("remote") ? "Remoto" : norm.includes("hibrido") ? "Híbrido" : "Presencial";
        const locM = title.match(/\[([^\]]{2,35})\]/);
        const location = locM ? locM[1].trim() : modality === "Remoto" ? "Remoto (Brasil)" : "Brasil";
        return extractCanonicalJob({
          id: `gh-${repo.replace("/", "-")}-${item.id}`,
          title,
          company,
          location,
          modality,
          seniority: `${title} ${labels.join(" ")}`,
          salary: "A combinar",
          skills: labels,
          description: body.slice(0, 1200) + (body.length > 1200 ? "..." : ""),
          url: item.html_url || `https://github.com/${repo}/issues`,
          source: `GitHub BR (${repo.split("/")[0]})`,
          posted_at: String(item.created_at || "").slice(0, 10),
        });
      });
    setCachedSource(key, jobs);
    return { source: `GitHub (${repo.split("/")[0]})`, jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: `GitHub (${repo.split("/")[0]})`, jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

/**
 * Coleta vagas de todas as fontes em pool de concorrência (limite = 5), deduplica (fuzzy Jaccard >= 0.85) e mede latências.
 */
export async function collectJobsWithTelemetry({
  sourceFilter = "all",
  primarySkill = "",
  includeLive = true,
  deepSearch = true,
  skills = [],
  suggestedRoles = [],
  forceRefresh = false,
} = {}) {
  const t0 = performance.now();
  if (forceRefresh) {
    for (const k of [...sourceCache.keys()]) {
      if (k !== "local") sourceCache.delete(k);
    }
  }

  const tasks = [];
  if (sourceFilter === "all" || sourceFilter === "local") {
    tasks.push(() => fetchLocalJobs());
  }

  const shouldLive = sourceFilter === "live" || (includeLive && sourceFilter === "all");
  if (shouldLive) {
    const terms = deepSearch ? buildDeepSearchTerms(skills, suggestedRoles, primarySkill) : [primarySkill];
    for (const t of terms.slice(0, deepSearch ? 3 : 1)) {
      tasks.push(() => fetchRemotive(t));
    }
    for (const t of terms.slice(0, deepSearch ? 2 : 1)) {
      tasks.push(() => fetchJobicy(t));
    }
    tasks.push(() => fetchArbeitnow());
    tasks.push(() => fetchGitHubBr("backend-br/vagas"));
    if (deepSearch) {
      tasks.push(() => fetchGitHubBr("qa-brasil/vagas"));
      tasks.push(() => fetchRemoteOk());
    }
  }

  // Concorrência controlada de no máximo 5 requisições simultâneas
  const batches = await runWithConcurrencyPool(tasks, 5);

  const rawJobs = [];
  const apiLatencies = {};
  const counts = {
    local_br: 0,
    remotive: 0,
    arbeitnow: 0,
    jobicy: 0,
    remoteok: 0,
    github_br: 0,
    deep_search: deepSearch,
  };

  for (const b of batches) {
    if (!b) continue;
    rawJobs.push(...b.jobs);
    if (b.source === "Base Brasil") counts.local_br += b.jobs.length;
    else if (b.source === "Remotive") counts.remotive += b.jobs.length;
    else if (b.source === "Arbeitnow") counts.arbeitnow += b.jobs.length;
    else if (b.source === "Jobicy") counts.jobicy += b.jobs.length;
    else if (b.source === "RemoteOK") counts.remoteok += b.jobs.length;
    else if (b.source.startsWith("GitHub")) counts.github_br += b.jobs.length;

    if (!apiLatencies[b.source]) {
      apiLatencies[b.source] = { latencyMs: b.latencyMs, count: b.jobs.length, cached: b.cached, ok: b.ok };
    } else {
      apiLatencies[b.source].latencyMs = Math.max(apiLatencies[b.source].latencyMs, b.latencyMs);
      apiLatencies[b.source].count += b.jobs.length;
      apiLatencies[b.source].cached = apiLatencies[b.source].cached && b.cached;
    }
  }

  const dedup = deduplicateJobs(rawJobs, 0.85);
  const totalFetchMs = Math.round(performance.now() - t0);

  return {
    jobs: dedup.jobs,
    sources: counts,
    telemetry: {
      totalFetchMs,
      totalRaw: dedup.totalRaw,
      totalUnique: dedup.totalUnique,
      duplicatesRemoved: dedup.duplicatesRemoved,
      dedupRate: dedup.dedupRate,
      apiLatencies,
    },
  };
}

export function buildExternalLinks(skills, roles, userCountry = "Brasil") {
  const query = (skills.slice(0, 3).join(" ") || roles[0] || "tecnologia").trim();
  const rawRole = roles[1] || roles[0] || query;
  const roleParts = rawRole.split("/").map((p) => p.trim()).filter(Boolean);
  const roleQuery = roleParts.sort((a, b) => b.length - a.length)[0] || query;
  const deepDork = `("${roleQuery}" OR "${query}") ("vaga" OR "remote" OR "remoto") ${userCountry}`;
  const compBrDork = `(site:gupy.io OR site:boards.greenhouse.io OR site:jobs.lever.co) ("${roleQuery}" OR "${query}") (${userCountry} OR "Remoto")`;
  const compGlobalDork = `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com) ("${roleQuery}" OR "${query}") ("Remote" OR "LATAM" OR "Brazil")`;
  const enc = encodeURIComponent(query);
  const encRole = encodeURIComponent(roleQuery);
  const encDork = encodeURIComponent(deepDork);
  const encCountry = encodeURIComponent(userCountry);
  return [
    { portal: `Sites de Empresas (${userCountry})`, url: `https://www.google.com/search?q=${encodeURIComponent(compBrDork)}` },
    { portal: "Carreiras Diretas (Global)", url: `https://www.google.com/search?q=${encodeURIComponent(compGlobalDork)}` },
    { portal: "Google Jobs (Busca Profunda)", url: `https://www.google.com/search?q=${encDork}&ibp=htl;jobs` },
    { portal: "LinkedIn (Skills)", url: `https://www.linkedin.com/jobs/search/?keywords=${enc}&location=${encCountry}` },
    { portal: "LinkedIn (Cargo)", url: `https://www.linkedin.com/jobs/search/?keywords=${encRole}&location=${encCountry}` },
    { portal: "Gupy", url: `https://portal.gupy.io/job-search/term=${encRole}` },
    { portal: "Indeed Brasil", url: `https://br.indeed.com/jobs?q=${enc}&l=${encCountry}` },
    { portal: "Glassdoor Brasil", url: `https://www.glassdoor.com.br/Vaga/brasil-${encodeURIComponent(roleQuery.toLowerCase().replace(/\s+/g, "-"))}-vagas-SRCH_IL.0,6_IN36.htm` },
    { portal: "Programathor", url: `https://programathor.com.br/jobs?search=${enc}` },
    { portal: "Catho", url: `https://www.catho.com.br/vagas/${encodeURIComponent(roleQuery.toLowerCase().replace(/\s+/g, "-"))}/` },
    { portal: "Vagas.com.br", url: `https://www.vagas.com.br/vagas-de-${encodeURIComponent(roleQuery.toLowerCase().replace(/\s+/g, "-"))}` },
    { portal: "GeekHunter", url: `https://www.geekhunter.com.br/vagas?q=${enc}` },
    { portal: "InfoJobs", url: `https://www.infojobs.com.br/empregos.aspx?palabra=${encRole}` },
    { portal: "Wellfound (Global)", url: `https://wellfound.com/jobs?q=${enc}` },
  ];
}
