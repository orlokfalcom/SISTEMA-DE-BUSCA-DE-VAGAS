/**
 * VagaPulse AI — Tradutor Automático para Vagas Importadas de Sites Externos
 * Traduz campos estruturados instantaneamente e texto livre (título, descrição, local)
 * sob demanda com cache local em memória + IndexedDB, sem bloquear a UI.
 */

import { idbGet, idbSet } from "./storage.js";
import { getUiLang } from "./i18n/config.js";

const LABEL_MAP = {
  modality: {
    Remoto: { pt: "Remoto", en: "Remote", fr: "Télétravail", es: "Remoto", ja: "リモート" },
    Híbrido: { pt: "Híbrido", en: "Hybrid", fr: "Hybride", es: "Híbrido", ja: "ハイブリッド" },
    Presencial: { pt: "Presencial", en: "On-site", fr: "Présentiel", es: "Presencial", ja: "出社" },
    "Não informado": { pt: "Não informado", en: "Not specified", fr: "Non précisé", es: "No especificado", ja: "未指定" },
  },
  seniority: {
    Estágio: { pt: "Estágio", en: "Intern", fr: "Stage", es: "Prácticas", ja: "インターン" },
    Júnior: { pt: "Júnior", en: "Junior", fr: "Junior", es: "Junior", ja: "ジュニア" },
    Pleno: { pt: "Pleno", en: "Mid-level", fr: "Confirmé", es: "Semi-Senior", ja: "ミドル" },
    Sênior: { pt: "Sênior", en: "Senior", fr: "Senior", es: "Senior", ja: "シニア" },
    Especialista: { pt: "Especialista", en: "Staff / Specialist", fr: "Expert / Lead", es: "Especialista", ja: "スペシャリスト" },
  },
  band: {
    Alta: { pt: "Alta", en: "High", fr: "Élevé", es: "Alta", ja: "高" },
    Média: { pt: "Média", en: "Medium", fr: "Moyen", es: "Media", ja: "中" },
    Baixa: { pt: "Baixa", en: "Low", fr: "Faible", es: "Baja", ja: "低" },
  },
  sector: {
    Cibersegurança: { pt: "Cibersegurança", en: "Cybersecurity", fr: "Cybersécurité", es: "Ciberseguridad", ja: "サイバーセキュリティ" },
    "Dados & IA": { pt: "Dados & IA", en: "Data & AI", fr: "Données & IA", es: "Datos e IA", ja: "データ＆AI" },
    "Engenharia de Software": { pt: "Engenharia de Software", en: "Software Engineering", fr: "Génie Logiciel", es: "Ingeniería de Software", ja: "ソフトウェア開発" },
    "DevOps & Cloud": { pt: "DevOps & Cloud", en: "DevOps & Cloud", fr: "DevOps & Cloud", es: "DevOps y Cloud", ja: "DevOps＆クラウド" },
    "QA & Qualidade": { pt: "QA & Qualidade", en: "QA & Quality", fr: "QA & Qualité", es: "QA y Calidad", ja: "QA＆テスト" },
    "Produto & Design": { pt: "Produto & Design", en: "Product & Design", fr: "Produit & Design", es: "Producto y Diseño", ja: "プロダクト＆デザイン" },
    "Negócios & Operações": { pt: "Negócios & Operações", en: "Business & Operations", fr: "Business & Opérations", es: "Negocios y Operaciones", ja: "ビジネス＆運営" },
    "Tecnologia & Geral": { pt: "Tecnologia & Geral", en: "Tech & General", fr: "Tech & Général", es: "Tecnología y General", ja: "テクノロジー一般" },
  },
  salary: {
    "A combinar": { pt: "A combinar", en: "Competitive / TBD", fr: "Selon profil", es: "A convenir", ja: "応相談" },
  },
};

export function translateStructuredField(group, value, lang = getUiLang()) {
  const table = LABEL_MAP[group];
  if (!table || !value) return value;
  const entry = table[value];
  if (!entry) return value;
  return entry[lang] || entry.en || entry.pt || value;
}

const translatedLabelLangs = new Set(["pt", "en", "fr", "es", "ja"]);

export async function ensureStructuredLabelsTranslated(targetLang) {
  if (!targetLang || translatedLabelLangs.has(targetLang)) return;
  const cacheKey = `labels_pack_${targetLang}`;
  const cached = await idbGet(cacheKey, null);
  if (cached && typeof cached === "object") {
    for (const [group, map] of Object.entries(cached)) {
      if (!LABEL_MAP[group]) continue;
      for (const [val, tr] of Object.entries(map)) {
        if (LABEL_MAP[group][val]) LABEL_MAP[group][val][targetLang] = tr;
      }
    }
    translatedLabelLangs.add(targetLang);
    return;
  }

  const pack = {};
  const tasks = [];
  for (const [group, table] of Object.entries(LABEL_MAP)) {
    pack[group] = {};
    for (const [val, entry] of Object.entries(table)) {
      tasks.push(async () => {
        const enText = entry.en || val;
        const tr = await translateTextRemote(enText, targetLang, "en");
        if (tr && tr !== enText) {
          entry[targetLang] = tr;
          pack[group][val] = tr;
        }
      });
    }
  }
  let taskIdx = 0;
  async function labelWorker() {
    while (taskIdx < tasks.length) {
      await tasks[taskIdx++]();
    }
  }
  await Promise.all(Array.from({ length: 5 }, () => labelWorker()));
  if (Object.values(pack).some((g) => Object.keys(g).length > 0)) {
    translatedLabelLangs.add(targetLang);
    idbSet(cacheKey, pack);
  }
}

const memoryTranslationCache = new Map(); // `${lang}:${jobId}` -> { title, description, location }
let persistedLoaded = false;
let persistedCache = {};

async function ensurePersistedCache() {
  if (persistedLoaded) return;
  persistedLoaded = true;
  const saved = await idbGet("job_translations", {});
  if (saved && typeof saved === "object") {
    persistedCache = saved;
    for (const [k, v] of Object.entries(saved)) {
      memoryTranslationCache.set(k, v);
    }
  }
}

export async function translateTextRemote(text, targetLang, sourceLang = "auto") {
  const clean = String(text || "").trim();
  if (!clean || !targetLang) return clean;

  // Evita chamadas externas em textos muito curtos ou idênticos
  const snippet = clean.slice(0, 1400);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 3500) : null;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceLang || "auto"
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(snippet)}`;
    const resp = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map((seg) => (Array.isArray(seg) ? seg[0] || "" : "")).join("").trim();
        if (translated) return translated;
      }
    }
  } catch {
    // tenta fallback MyMemory abaixo
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (snippet.length <= 500 && sourceLang && sourceLang !== "auto") {
    const mmCtrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const mmTimer = mmCtrl ? setTimeout(() => mmCtrl.abort(), 3000) : null;
    try {
      const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(snippet)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
      const resp = await fetch(mmUrl, mmCtrl ? { signal: mmCtrl.signal } : undefined);
      if (resp.ok) {
        const mm = await resp.json();
        const tr = mm?.responseData?.translatedText;
        if (tr && typeof tr === "string") return tr.trim();
      }
    } catch {
      // mantém texto original em caso offline
    } finally {
      if (mmTimer) clearTimeout(mmTimer);
    }
  }
  return clean;
}

export function getTranslatedJobView(job, lang = getUiLang()) {
  if (!job) return job;
  const cacheKey = `${lang}:${job.id}`;
  const cached = memoryTranslationCache.get(cacheKey);
  const band = job.score_band
    ? { ...job.score_band, label: translateStructuredField("band", job.score_band.label, lang) }
    : undefined;

  return {
    ...job,
    title: (cached && cached.title) || job.title,
    description: (cached && cached.description) || job.description,
    location: (cached && cached.location) || job.location,
    modality: translateStructuredField("modality", job.modality, lang),
    seniority: translateStructuredField("seniority", job.seniority, lang),
    sector: translateStructuredField("sector", job.sector, lang),
    salary: translateStructuredField("salary", job.salary, lang),
    score_band: band,
  };
}

/**
 * Traduz em lote as vagas visíveis cujo idioma original difere do idioma selecionado na UI.
 */
export async function translateJobsBatch(jobs, targetLang = getUiLang(), { includeDescription = false, limit = 12 } = {}) {
  if (!Array.isArray(jobs) || !jobs.length || !targetLang) return 0;
  await Promise.all([ensurePersistedCache(), ensureStructuredLabelsTranslated(targetLang)]);

  const candidates = jobs
    .filter((j) => {
      if (!j || !j.id) return false;
      const srcLang = j.jobLanguage || "pt";
      if (srcLang === targetLang) return false;
      const key = `${targetLang}:${j.id}`;
      const hit = memoryTranslationCache.get(key);
      if (!hit) return true;
      return includeDescription && !hit.description && Boolean(j.description);
    })
    .slice(0, limit);

  if (!candidates.length) return 0;

  let updatedCount = 0;
  const CONCURRENCY = 4;
  let idx = 0;

  async function worker() {
    while (idx < candidates.length) {
      const job = candidates[idx++];
      const key = `${targetLang}:${job.id}`;
      const existing = memoryTranslationCache.get(key) || {};
      const srcLang = job.jobLanguage || "auto";

      const title = existing.title || (await translateTextRemote(job.title, targetLang, srcLang));
      const location = existing.location || (await translateTextRemote(job.location, targetLang, srcLang));
      let description = existing.description || "";
      if (includeDescription && job.description && !description) {
        description = await translateTextRemote(job.description, targetLang, srcLang);
      }

      if (title !== job.title || location !== job.location || description) {
        const entry = { title, location, ...(description ? { description } : {}) };
        memoryTranslationCache.set(key, entry);
        persistedCache[key] = entry;
        updatedCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));

  if (updatedCount > 0) {
    // Mantém cache persistido enxuto (últimas 300 traduções)
    const keys = Object.keys(persistedCache);
    if (keys.length > 300) {
      for (const oldKey of keys.slice(0, keys.length - 300)) {
        delete persistedCache[oldKey];
      }
    }
    idbSet("job_translations", persistedCache);
  }
  return updatedCount;
}
