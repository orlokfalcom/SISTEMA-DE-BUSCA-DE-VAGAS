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
export async function fetchJsonWithRetry(url, { timeoutMs = 3800, retries = 1, baseDelayMs = 300 } = {}) {
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
  try {
    const data = await fetchJsonWithRetry("./data/local_jobs.json", { timeoutMs: 4000, retries: 1 });
    const canonical = (Array.isArray(data) ? data : []).map(extractCanonicalJob);
    setCachedSource("local", canonical, 30 * 60 * 1000);
    return { source: "Base Brasil", jobs: canonical, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Base Brasil", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
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

async function fetchHimalayas() {
  const key = "himalayas";
  const cached = getCachedSource(key);
  if (cached) return { source: "Himalayas", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://himalayas.app/jobs/api?limit=25");
    const jobs = (payload.jobs || []).slice(0, 25).map((item, idx) => {
      const desc = stripHtml(item.description || item.excerpt || "");
      return extractCanonicalJob({
        id: `himalayas-${item.guid || item.slug || idx}`,
        title: item.title || "Remote Job",
        company: item.companyName || "Empresa Global",
        location: (item.locationRestrictions || []).join(", ") || "Remoto Global",
        modality: "Remoto",
        seniority: `${item.title || ""} ${(item.seniority || []).join(" ")}`,
        salary: item.minSalary && item.maxSalary ? `USD ${item.minSalary} - ${item.maxSalary}` : "A combinar",
        skills: item.categories || [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.applicationLink || `https://himalayas.app/jobs/${item.slug || ""}`,
        source: "Himalayas (Global)",
        posted_at: item.pubDate ? new Date(item.pubDate * 1000).toISOString().slice(0, 10) : "",
      });
    });
    setCachedSource(key, jobs);
    return { source: "Himalayas", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Himalayas", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchWorkingNomads() {
  const key = "workingnomads";
  const cached = getCachedSource(key);
  if (cached) return { source: "Working Nomads", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://www.workingnomads.com/api/exposed_jobs/");
    const jobs = (Array.isArray(payload) ? payload : []).slice(0, 25).map((item, idx) => {
      const desc = stripHtml(item.description || "");
      return extractCanonicalJob({
        id: `wn-${idx}-${(item.url || "").slice(-16)}`,
        title: item.title || "Remote Job",
        company: item.company_name || "Empresa Global",
        location: item.location || "Remoto Global",
        modality: "Remoto",
        salary: "A combinar",
        skills: String(item.tags || "").split(",").map((s) => s.trim()).filter(Boolean),
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.url || "https://www.workingnomads.com/jobs",
        source: "Working Nomads (Global)",
        posted_at: String(item.pub_date || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "Working Nomads", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Working Nomads", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchTheMuse() {
  const key = "themuse";
  const cached = getCachedSource(key);
  if (cached) return { source: "The Muse", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://www.themuse.com/api/public/jobs?page=1");
    const jobs = (payload.results || []).slice(0, 20).map((item) => {
      const desc = stripHtml(item.contents || "");
      const loc = (item.locations || []).map((l) => l.name).join(", ") || "Global";
      const normLoc = normalizeText(loc);
      return extractCanonicalJob({
        id: `themuse-${item.id}`,
        title: item.name || "Global Role",
        company: (item.company && item.company.name) || "Global Company",
        location: loc,
        modality: normLoc.includes("remote") || normLoc.includes("flexible") ? "Remoto" : "Híbrido",
        seniority: `${item.name || ""} ${(item.levels || []).map((l) => l.name).join(" ")}`,
        salary: "A combinar",
        skills: (item.categories || []).map((c) => c.name),
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: (item.refs && item.refs.landing_page) || "https://www.themuse.com/jobs",
        source: "The Muse (Global)",
        posted_at: String(item.publication_date || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "The Muse", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "The Muse", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchGreenhouseBoard(slug, label) {
  const key = `gh_board:${slug}`;
  const cached = getCachedSource(key);
  if (cached) return { source: "Greenhouse ATS", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    const jobs = (payload.jobs || []).slice(0, 15).map((item) => {
      const loc = (item.location && item.location.name) || "Global";
      const normLoc = normalizeText(loc);
      const desc = stripHtml(item.content || "");
      return extractCanonicalJob({
        id: `greenhouse-${slug}-${item.id}`,
        title: item.title || "Carreira Direta",
        company: label,
        location: loc,
        modality: normLoc.includes("remote") || normLoc.includes("remoto") ? "Remoto" : normLoc.includes("hybrid") ? "Híbrido" : "Presencial",
        salary: "A combinar",
        skills: [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.absolute_url || `https://boards.greenhouse.io/${slug}`,
        source: `Greenhouse (${label})`,
        posted_at: String(item.updated_at || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "Greenhouse ATS", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Greenhouse ATS", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchLeverBoard(slug, label) {
  const key = `lever:${slug}`;
  const cached = getCachedSource(key);
  if (cached) return { source: "Lever ATS", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    const jobs = (Array.isArray(payload) ? payload : []).slice(0, 15).map((item) => {
      const loc = (item.categories && item.categories.location) || "Global";
      const normLoc = normalizeText(`${loc} ${item.workplaceType || ""}`);
      const desc = stripHtml(item.descriptionPlain || item.description || "");
      return extractCanonicalJob({
        id: `lever-${slug}-${item.id}`,
        title: item.text || "Carreira Direta",
        company: label,
        location: loc,
        modality: normLoc.includes("remote") ? "Remoto" : normLoc.includes("hybrid") ? "Híbrido" : "Presencial",
        salary: "A combinar",
        skills: [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.hostedUrl || `https://jobs.lever.co/${slug}`,
        source: `Lever (${label})`,
        posted_at: item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : "",
      });
    });
    setCachedSource(key, jobs);
    return { source: "Lever ATS", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Lever ATS", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchAshbyBoard(slug, label) {
  const key = `ashby:${slug}`;
  const cached = getCachedSource(key);
  if (cached) return { source: "Ashby ATS", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { timeoutMs: 3200, retries: 0 });
    const jobs = (payload.jobs || []).slice(0, 12).map((item) => {
      const loc = item.location || "Global";
      const normLoc = normalizeText(`${loc} ${item.isRemote ? "remote" : ""}`);
      const desc = stripHtml(item.descriptionPlain || item.descriptionHtml || "");
      return extractCanonicalJob({
        id: `ashby-${slug}-${item.id}`,
        title: item.title || "Carreira Direta",
        company: label,
        location: loc,
        modality: item.isRemote || normLoc.includes("remote") ? "Remoto" : normLoc.includes("hybrid") ? "Híbrido" : "Presencial",
        salary: "A combinar",
        skills: [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: item.jobUrl || `https://jobs.ashbyhq.com/${slug}`,
        source: `Ashby (${label})`,
        posted_at: String(item.publishedAt || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "Ashby ATS", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "Ashby ATS", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchSmartRecruitersBoard(slug, label) {
  const key = `sr:${slug}`;
  const cached = getCachedSource(key);
  if (cached) return { source: "SmartRecruiters ATS", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=12`, { timeoutMs: 3200, retries: 0 });
    const jobs = (payload.content || []).slice(0, 12).map((item) => {
      const locParts = [item.location?.city, item.location?.country].filter(Boolean);
      const loc = locParts.join(", ") || "Global";
      const remoteFlag = Boolean(item.location?.remote);
      return extractCanonicalJob({
        id: `sr-${slug}-${item.id}`,
        title: item.name || "Global Career",
        company: label,
        location: loc,
        modality: remoteFlag ? "Remoto" : "Híbrido",
        salary: "A combinar",
        skills: [],
        description: `${item.name || ""} at ${label} (${loc}). ${item.department?.label || ""}`,
        url: item.ref ? `https://jobs.smartrecruiters.com/${slug}/${item.id}` : `https://jobs.smartrecruiters.com/${slug}`,
        source: `SmartRecruiters (${label})`,
        posted_at: String(item.releasedDate || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "SmartRecruiters ATS", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "SmartRecruiters ATS", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchDevItJobsUk() {
  const key = "devitjobs_uk";
  const cached = getCachedSource(key);
  if (cached) return { source: "DevITjobs UK", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://devitjobs.uk/api/jobsLight", { timeoutMs: 3200, retries: 0 });
    const jobs = (Array.isArray(payload) ? payload : []).slice(0, 15).map((item) => {
      const loc = item.actualCity || item.cityCategory || "United Kingdom";
      const remote = /remote|hybrid/i.test(String(item.workplace || ""));
      return extractCanonicalJob({
        id: `devituk-${item._id || item.jobUrl}`,
        title: item.name || "Tech Role UK",
        company: item.company || "UK Tech",
        location: loc,
        modality: remote ? "Remoto" : "Híbrido",
        salary: item.annualSalaryFrom && item.annualSalaryTo ? `GBP ${item.annualSalaryFrom} - ${item.annualSalaryTo}` : "A combinar",
        skills: item.technologies || [],
        description: `${item.name || ""} at ${item.company || ""} (${loc}). Technologies: ${(item.technologies || []).join(", ")}`,
        url: item.jobUrl ? `https://devitjobs.uk/jobs/${item.jobUrl}` : "https://devitjobs.uk",
        source: "DevITjobs UK (Europa)",
        posted_at: String(item.activeFrom || "").slice(0, 10),
      });
    });
    setCachedSource(key, jobs);
    return { source: "DevITjobs UK", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "DevITjobs UK", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

async function fetchGetOnBrd() {
  const key = "getonbrd";
  const cached = getCachedSource(key);
  if (cached) return { source: "GetOnBrd LATAM", jobs: cached, latencyMs: 0, cached: true, ok: true };

  const t0 = performance.now();
  try {
    const payload = await fetchJsonWithRetry("https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=15", { timeoutMs: 3200, retries: 0 });
    const jobs = (payload.data || []).slice(0, 15).map((item) => {
      const attr = item.attributes || {};
      const desc = stripHtml(attr.description || attr.functions || "");
      return extractCanonicalJob({
        id: `getonbrd-${item.id}`,
        title: attr.title || "Tech Job LATAM",
        company: (attr.company && attr.company.data && attr.company.data.attributes && attr.company.data.attributes.name) || "Empresa LATAM",
        location: attr.remote ? "Remoto LATAM" : (attr.countries || []).join(", ") || "LATAM",
        modality: attr.remote ? "Remoto" : "Híbrido",
        salary: attr.min_salary && attr.max_salary ? `USD ${attr.min_salary} - ${attr.max_salary}` : "A combinar",
        skills: [],
        description: desc.slice(0, 1200) + (desc.length > 1200 ? "..." : ""),
        url: (item.links && item.links.public_url) || "https://www.getonbrd.com",
        source: "GetOnBrd (LATAM)",
        posted_at: attr.published_at ? new Date(attr.published_at * 1000).toISOString().slice(0, 10) : "",
      });
    });
    setCachedSource(key, jobs);
    return { source: "GetOnBrd LATAM", jobs, latencyMs: Math.round(performance.now() - t0), cached: false, ok: true };
  } catch {
    return { source: "GetOnBrd LATAM", jobs: [], latencyMs: Math.round(performance.now() - t0), cached: false, ok: false };
  }
}

const GLOBAL_COMPANY_BOARDS = {
  greenhouse: [
    ["nubank", "Nubank"], ["brex", "Brex"], ["quintoandar", "QuintoAndar"], ["vtex", "VTEX"],
    ["gitlab", "GitLab"], ["cloudflare", "Cloudflare"], ["datadog", "Datadog"], ["elastic", "Elastic"],
    ["mongodb", "MongoDB"], ["canonical", "Canonical"], ["stripe", "Stripe"], ["figma", "Figma"], ["discord", "Discord"],
  ],
  lever: [
    ["spotify", "Spotify"], ["netflix", "Netflix"], ["palantir", "Palantir"], ["atlassian", "Atlassian"], ["plaid", "Plaid"],
  ],
  ashby: [
    ["openai", "OpenAI"], ["notion", "Notion"], ["supabase", "Supabase"], ["vanta", "Vanta"], ["vercel", "Vercel"], ["linear", "Linear"],
  ],
  smartrecruiters: [
    ["BoschGroup", "Bosch"], ["Visa", "Visa"], ["IKEA", "IKEA"], ["Adidas", "Adidas"],
  ],
};

/**
 * Coleta vagas de todas as fontes em pool de concorrência (limite = 6), deduplica (fuzzy Jaccard >= 0.85) e mede latências.
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
    tasks.push(() => fetchHimalayas());
    tasks.push(() => fetchGitHubBr("backend-br/vagas"));
    if (deepSearch) {
      tasks.push(() => fetchWorkingNomads());
      tasks.push(() => fetchGitHubBr("frontendbr/vagas"));
      tasks.push(() => fetchGitHubBr("qa-brasil/vagas"));
      tasks.push(() => fetchGitHubBr("react-brasil/vagas"));
      tasks.push(() => fetchGitHubBr("androiddevbr/vagas"));
      tasks.push(() => fetchGitHubBr("soujava/vagas"));
      tasks.push(() => fetchRemoteOk());
      tasks.push(() => fetchTheMuse());
      tasks.push(() => fetchDevItJobsUk());
      tasks.push(() => fetchGetOnBrd());
      // Sites diretos de empresas em todo o mundo (Greenhouse, Lever, Ashby, SmartRecruiters)
      for (const [slug, label] of GLOBAL_COMPANY_BOARDS.greenhouse) {
        tasks.push(() => fetchGreenhouseBoard(slug, label));
      }
      for (const [slug, label] of GLOBAL_COMPANY_BOARDS.lever) {
        tasks.push(() => fetchLeverBoard(slug, label));
      }
      for (const [slug, label] of GLOBAL_COMPANY_BOARDS.ashby) {
        tasks.push(() => fetchAshbyBoard(slug, label));
      }
      for (const [slug, label] of GLOBAL_COMPANY_BOARDS.smartrecruiters) {
        tasks.push(() => fetchSmartRecruitersBoard(slug, label));
      }
    }
  }

  // Concorrência controlada de no máximo 6 requisições simultâneas
  const batches = await runWithConcurrencyPool(tasks, 6);

  const rawJobs = [];
  const apiLatencies = {};
  const counts = {
    local_br: 0,
    remotive: 0,
    arbeitnow: 0,
    jobicy: 0,
    remoteok: 0,
    himalayas: 0,
    workingnomads: 0,
    themuse: 0,
    ats_direct: 0,
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
    else if (b.source === "Himalayas") counts.himalayas += b.jobs.length;
    else if (b.source === "Working Nomads") counts.workingnomads += b.jobs.length;
    else if (b.source === "The Muse") counts.themuse += b.jobs.length;
    else if (b.source === "DevITjobs UK" || b.source === "GetOnBrd LATAM") counts.themuse += b.jobs.length;
    else if (b.source.endsWith("ATS")) counts.ats_direct += b.jobs.length;
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
  const deepDork = `("${roleQuery}" OR "${query}") ("vaga" OR "remote" OR "remoto" OR "job")`;
  const atsGlobalDork = `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:jobs.smartrecruiters.com OR site:apply.workable.com OR site:bamboohr.com) ("${roleQuery}" OR "${query}")`;
  const compBrDork = `(site:gupy.io OR site:vagas.com.br OR site:inhire.app OR site:kenoby.com OR site:solides.jobs) ("${roleQuery}" OR "${query}") (${userCountry} OR "Remoto")`;
  const enc = encodeURIComponent(query);
  const encRole = encodeURIComponent(roleQuery);
  const encDork = encodeURIComponent(deepDork);
  const encCountry = encodeURIComponent(userCountry);
  const slugRole = encodeURIComponent(roleQuery.toLowerCase().replace(/\s+/g, "-"));
  return [
    // ATS Globais & Carreira Direta
    { portal: `ATS Brasil (Gupy/Kenoby/InHire)`, url: `https://www.google.com/search?q=${encodeURIComponent(compBrDork)}` },
    { portal: "ATS Globais (Greenhouse/Lever/Ashby/Workday)", url: `https://www.google.com/search?q=${encodeURIComponent(atsGlobalDork)}` },
    { portal: "Google Jobs (Mundial)", url: `https://www.google.com/search?q=${encDork}&ibp=htl;jobs` },
    // Redes & Portais Globais
    { portal: "LinkedIn Global", url: `https://www.linkedin.com/jobs/search/?keywords=${encRole}` },
    { portal: `LinkedIn (${userCountry})`, url: `https://www.linkedin.com/jobs/search/?keywords=${enc}&location=${encCountry}` },
    { portal: "Indeed Global", url: `https://www.indeed.com/jobs?q=${encRole}` },
    { portal: "Indeed Brasil", url: `https://br.indeed.com/jobs?q=${enc}&l=${encCountry}` },
    { portal: "Glassdoor Global", url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encRole}` },
    { portal: "Wellfound (Startups)", url: `https://wellfound.com/jobs?q=${enc}` },
    { portal: "Himalayas (Remote)", url: `https://himalayas.app/jobs?q=${enc}` },
    { portal: "We Work Remotely", url: `https://weworkremotely.com/remote-jobs/search?term=${enc}` },
    { portal: "RemoteOK", url: `https://remoteok.com/remote-${slugRole}-jobs` },
    { portal: "Remotive", url: `https://remotive.com/remote-jobs?search=${enc}` },
    { portal: "Working Nomads", url: `https://www.workingnomads.com/jobs?q=${enc}` },
    { portal: "The Muse", url: `https://www.themuse.com/search/keyword/${enc}` },
    { portal: "BuiltIn (US/Global)", url: `https://builtin.com/jobs?search=${enc}` },
    { portal: "Dice (Tech US)", url: `https://www.dice.com/jobs?q=${encRole}` },
    { portal: "ZipRecruiter", url: `https://www.ziprecruiter.com/jobs-search?search=${encRole}` },
    // Europa & Ásia-Pacífico
    { portal: "Arbeitnow (Europa)", url: `https://www.arbeitnow.com/jobs?search=${enc}` },
    { portal: "Landing.jobs (Europa)", url: `https://landing.jobs/jobs?q=${enc}` },
    { portal: "Welcome to the Jungle", url: `https://www.welcometothejungle.com/en/jobs?query=${enc}` },
    { portal: "Relocate.me (Visto/Global)", url: `https://relocate.me/search?query=${enc}` },
    { portal: "Reed (Reino Unido)", url: `https://www.reed.co.uk/jobs/${slugRole}-jobs` },
    { portal: "StepStone (Alemanha/EU)", url: `https://www.stepstone.de/jobs/${slugRole}.html` },
    { portal: "TokyoDev (Japão/APAC)", url: `https://www.tokyodev.com/jobs?q=${enc}` },
    { portal: "Seek (Austrália/NZ)", url: `https://www.seek.com.au/${slugRole}-jobs` },
    // Brasil & América Latina
    { portal: "Gupy", url: `https://portal.gupy.io/job-search/term=${encRole}` },
    { portal: "GetOnBrd (LATAM)", url: `https://www.getonbrd.com/jobs-${slugRole}` },
    { portal: "Programathor", url: `https://programathor.com.br/jobs?search=${enc}` },
    { portal: "GeekHunter", url: `https://www.geekhunter.com.br/vagas?q=${enc}` },
    { portal: "Catho", url: `https://www.catho.com.br/vagas/${slugRole}/` },
    { portal: "Vagas.com.br", url: `https://www.vagas.com.br/vagas-de-${slugRole}` },
    { portal: "InfoJobs", url: `https://www.infojobs.com.br/empregos.aspx?palabra=${encRole}` },
    { portal: "Trampos.co", url: `https://trampos.co/oportunidades?tr=${enc}` },
  ];
}
