/**
 * VagaPulse AI — Motor de Matching Híbrido Explicável, Feedback Loop & Avaliação
 */

import {
  SENIORITY_LEVELS,
  expandCrossLingualConcepts,
  extractCanonicalJob,
  extractSkillsCanonical,
  findRelatedSkillsViaGraph,
  normalizeSeniority,
  normalizeText,
  resolveSkillAlias,
  tokenize,
} from "./nlp.js";
import { InvertedIndex } from "./index.js";
import { buildCorpusStats, evaluateJobAuthenticity } from "./fraud.js";
import {
  MATCH_WEIGHTS,
  ROLE_FAMILY_WEIGHT_PROFILES,
  WEIGHT_VERSION,
  getCompatibilityBand,
  normalizeMatchWeights,
  validateWeights,
} from "./matching_v2/weights.js";
import { evaluateCompetencies, extractSkillEvidences } from "./matching_v2/competencies.js";
import {
  computeConfidenceAndCoverage,
  computeSeniorityScoreV2,
  evaluateEducation,
  evaluateExperienceContext,
  evaluateLanguages,
  evaluateLocationModality,
  evaluateResponsibilities,
  extractAndEvaluateRequirements,
  precomputeCandidateContext,
} from "./matching_v2/contextAnalyzers.js";
import {
  adaptWeightsFromFeedbackV2,
  auditFairnessCompliance,
  computeRankingQualityMetricsV2,
  rollbackWeightsVersion,
} from "./matching_v2/evaluation.js";

export {
  MATCH_WEIGHTS,
  ROLE_FAMILY_WEIGHT_PROFILES,
  WEIGHT_VERSION,
  auditFairnessCompliance,
  getCompatibilityBand,
  rollbackWeightsVersion,
  validateWeights,
};

export const DEFAULT_WEIGHTS = {
  exactSkills: 0.42,
  relatedSkills: 0.13,
  semantic: 0.22,
  seniority: 0.13,
  roleSector: 0.10,
};

const WEIGHT_BOUNDS = { min: 0.05, max: 0.65 };

let _cachedCorpusKey = "";
let _cachedCorpusStats = null;
let _authCacheCorpusKey = "";
let _authCache = new WeakMap();
const _titleSkillsCache = new Map();

function getCachedTitleSkills(title) {
  const key = String(title || "");
  let hit = _titleSkillsCache.get(key);
  if (!hit) {
    hit = new Set(extractSkillsCanonical(key).map((s) => s.toLowerCase()));
    if (_titleSkillsCache.size > 1000) _titleSkillsCache.clear();
    _titleSkillsCache.set(key, hit);
  }
  return hit;
}

function getCachedCorpusStats(canonicalJobs) {
  const n = canonicalJobs.length;
  const firstId = n ? canonicalJobs[0].id : "";
  const lastId = n ? canonicalJobs[n - 1].id : "";
  const key = `${n}:${firstId}:${lastId}`;
  if (_cachedCorpusStats && _cachedCorpusKey === key) return _cachedCorpusStats;
  _cachedCorpusKey = key;
  _cachedCorpusStats = buildCorpusStats(canonicalJobs);
  if (_authCacheCorpusKey !== key) {
    _authCacheCorpusKey = key;
    _authCache = new WeakMap();
  }
  return _cachedCorpusStats;
}

const SOURCE_TRUST = {
  "Base Brasil": 3,
  "Carreira Direta": 3,
  "GitHub BR": 2,
  "Remotive (Ao Vivo)": 2,
  "Jobicy (Ao Vivo)": 2,
  "RemoteOK (Ao Vivo)": 2,
  "Arbeitnow (Ao Vivo)": 1,
};

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || !vecA.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = Number(vecA[i]);
    const b = Number(vecB[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
}

/**
 * Avaliação contextual e assimétrica de senioridade (V2):
 * não penaliza automaticamente profissionais experientes aplicando a cargos menores.
 */
export function computeSeniorityScore(candidateSeniority, jobSeniority, ctx = {}) {
  return computeSeniorityScoreV2(candidateSeniority, jobSeniority, ctx);
}

export function classifyGeoPriority(job, userCountry = "Brasil") {
  const countryNorm = normalizeText(userCountry || "Brasil");
  const hay = normalizeText(`${job.location || ""} ${job.source || ""} ${job.company_origin || ""}`);
  const brSignals = [
    "brasil", "brazil", "sao paulo", "belo horizonte", "rio de janeiro",
    "curitiba", "porto alegre", "campinas", "florianopolis", "recife",
    "goiania", "base brasil", "github br", ", sp", ", rj", ", mg", ", rs", ", pr",
  ];
  const isUserCountry =
    countryNorm === "brasil" ? brSignals.some((s) => hay.includes(s)) : Boolean(countryNorm && hay.includes(countryNorm));

  // Compatibilidade geográfica é dimensão independente: zero bônus artificial no score profissional
  if (isUserCountry) {
    return { scope: "local_country", label: `${countryNorm === "brasil" ? "🇧🇷" : "📍"} ${userCountry}`, bonus: 0 };
  }
  const globalSignals = ["anywhere", "worldwide", "remoto global", "latam", "south america", "americas", "global"];
  if (globalSignals.some((s) => hay.includes(s))) {
    return { scope: "global_remote", label: "🌎 Global / LATAM", bonus: 0 };
  }
  return { scope: "international", label: "🌐 Internacional", bonus: 0 };
}

export function parseSalaryValue(salaryStr) {
  if (!salaryStr) return 0;
  const nums = [];
  for (const m of String(salaryStr).matchAll(/(\d+(?:[.,]\d+)?)\s*k\b/gi)) {
    const val = Math.round(parseFloat(m[1].replace(",", ".")) * 1000);
    if (!Number.isNaN(val)) nums.push(val);
  }
  for (const m of String(salaryStr).matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,6})/g)) {
    const cleaned = m[1].replace(/[.,]/g, "");
    if (/^\d+$/.test(cleaned)) nums.push(parseInt(cleaned, 10));
  }
  return nums.length ? Math.max(...nums) : 0;
}

export function getScoreBand(scorePct) {
  if (scorePct >= 80) return { key: "high", label: "Alta", css: "score-high" };
  if (scorePct >= 60) return { key: "mid", label: "Média", css: "score-mid" };
  return { key: "low", label: "Baixa", css: "score-low" };
}

function postedSortKey(postedAt) {
  const val = String(postedAt || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(val) ? `1:${val}` : "0:";
}

function getSourceTrust(source) {
  const s = String(source || "");
  for (const [prefix, trust] of Object.entries(SOURCE_TRUST)) {
    if (s.startsWith(prefix)) return trust;
  }
  return 1;
}

/**
 * Extrai resultado/objetivo de negócio citado na descrição da vaga para compor o pitch.
 */
function extractBusinessOutcome(job) {
  const desc = String(job.description || "");
  const sentences = desc.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  const outcomePatterns = [
    /(?:escal|performanc|latenc|seguranc|qualidad|cresciment|automac|experienc|eficienc|produtivid|reduc|otimiz)/i,
    /(?:scale|performanc|security|reliab|autom|grow|impact|efficienc|latency|observab|fraud|risk)/i,
  ];
  for (const s of sentences) {
    if (outcomePatterns.some((re) => re.test(s))) {
      return s.trim().slice(0, 120).replace(/[.;,\s]+$/, "");
    }
  }
  return "";
}

/**
 * Gera pitch personalizado em PT-BR ou EN conforme o idioma da vaga, usando skills de maior peso e objetivo de negócio.
 */
export function buildBilingualPitch(job, matchedSkills, relatedMatches, candidateSeniority) {
  const lang = job.jobLanguage || "pt";
  const topSkills = [
    ...matchedSkills.slice(0, 3),
    ...relatedMatches.slice(0, Math.max(0, 3 - matchedSkills.length)).map((r) => r.skill),
  ].slice(0, 4);
  const skillsTxt = topSkills.length
    ? topSkills.join(", ")
    : (lang === "en" ? "software engineering & data analysis" : "tecnologia e entrega de soluções");
  const outcome = extractBusinessOutcome(job);

  if (lang === "en") {
    const outcomePart = outcome
      ? ` I'm particularly excited about contributing to goals like "${outcome}".`
      : "";
    return `Hi! I noticed the ${job.title} opening at ${job.company} and believe my ${candidateSeniority} background aligns strongly, especially my hands-on experience with ${skillsTxt}.${outcomePart} I'd love to connect and discuss how I can add value to the team.`;
  }

  if (lang === "fr") {
    const outcomePart = outcome
      ? ` L'objectif du poste autour de "${outcome}" m'intéresse particulièrement.`
      : "";
    return `Bonjour ! J'ai vu l'offre ${job.title} chez ${job.company} et mon profil (${candidateSeniority}) correspond fortement, notamment grâce à mon expérience pratique avec ${skillsTxt}.${outcomePart} Je serais ravi d'échanger sur la valeur que je peux apporter à votre équipe.`;
  }

  if (lang === "es") {
    const outcomePart = outcome
      ? ` Me entusiasma especialmente el enfoque del puesto en "${outcome}".`
      : "";
    return `¡Hola! Vi la vacante de ${job.title} en ${job.company} y considero que mi perfil (${candidateSeniority}) encaja muy bien, especialmente por mi experiencia práctica con ${skillsTxt}.${outcomePart} Me encantaría conversar sobre cómo aportar valor al equipo.`;
  }

  if (lang === "ja") {
    const outcomePart = outcome ? ` 特に「${outcome}」というミッションに強く惹かれています。` : "";
    return `はじめまして。${job.company}の「${job.title}」の求人を拝見し、${candidateSeniority}レベルとして${skillsTxt}の実務経験が貴社に貢献できると確信しております。${outcomePart}ぜひ一度お話しさせていただけますと幸いです。`;
  }

  const outcomePart = outcome
    ? ` Chamou minha atenção o foco da vaga em "${outcome}".`
    : "";
  return `Olá! Vi a vaga de ${job.title} na ${job.company} e tenho forte aderência ao perfil (${candidateSeniority}), especialmente pela minha prática com ${skillsTxt}.${outcomePart} Fico à disposição para conversarmos sobre como posso gerar impacto no time!`;
}

/**
 * Escapa HTML com segurança e destaca termos que deram match na descrição da vaga.
 */
export function highlightMatchedTerms(text, terms = []) {
  const raw = String(text || "");
  const escaped = raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const uniqueTerms = [...new Set(terms.map((t) => String(t || "").trim()).filter((t) => t.length >= 2))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 18);

  if (!uniqueTerms.length) return escaped;

  const pattern = uniqueTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`(?<![a-zA-Z0-9])(${pattern})(?![a-zA-Z0-9])`, "gi");
  return escaped.replace(re, '<mark class="match-hl">$1</mark>');
}

/**
 * Normaliza vetor de pesos para somar exatamente 1.0 respeitando limites seguros e tratando NaN/Infinity.
 */
export function normalizeWeights(weights) {
  const isV2 = weights && Object.prototype.hasOwnProperty.call(weights, "transferableSkills");
  if (isV2) return normalizeMatchWeights(weights, MATCH_WEIGHTS);
  return normalizeMatchWeights(weights, DEFAULT_WEIGHTS, WEIGHT_BOUNDS);
}

/**
 * Atualiza pesos locais (regressão leve / bandit contextual) a partir de feedback 👍 (reward=+1) ou 👎 (reward=-1).
 */
export function adaptWeightsFromFeedback(currentWeights, breakdown, reward, lr = 0.035) {
  if (currentWeights && Object.prototype.hasOwnProperty.call(currentWeights, "transferableSkills")) {
    const res = adaptWeightsFromFeedbackV2(currentWeights, [{ type: reward > 0 ? "interest" : "dislike", breakdown }], lr, 1);
    return res.weights;
  }
  if (!breakdown || !reward) return normalizeWeights(currentWeights);
  const features = {
    exactSkills: (breakdown.exactSkills || 0) / 100,
    relatedSkills: (breakdown.relatedSkills || 0) / 100,
    semantic: (breakdown.semantic || 0) / 100,
    seniority: (breakdown.seniority || 0) / 100,
    roleSector: (breakdown.roleSector || 0) / 100,
  };
  const meanFeature = Object.values(features).reduce((a, b) => a + b, 0) / 5;
  const updated = { ...normalizeWeights(currentWeights) };

  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const signal = features[key] - meanFeature;
    updated[key] = updated[key] + lr * reward * signal;
  }
  return normalizeWeights(updated);
}

/**
 * Calcula métricas estatísticas reais de qualidade do ranking (Precision@K, Recall@K, NDCG@K, MAP, MRR, FPR, FNR).
 */
export function computeRankingQualityMetrics(rankedJobs, feedbackMap = {}, k = 10) {
  return computeRankingQualityMetricsV2(rankedJobs, feedbackMap, k);
}

/**
 * Executa o pipeline completo de matching híbrido explicável usando Índice Invertido + Embeddings/BM25.
 */
export function matchJobsHybrid({
  jobs,
  index = null,
  candidateSkills = [],
  candidateText = "",
  candidateSeniority = "Pleno",
  candidateYears = null,
  candidateSector = "",
  suggestedRoles = [],
  userCountry = "Brasil",
  candidateEmbedding = null,
  jobEmbeddings = null, // Map<id, Float32Array|number[]>
  weights = DEFAULT_WEIGHTS,
  feedbackMap = {},
  filters = {},
}) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const canonicalJobs = safeJobs.map((j) => (j.canonical ? j : extractCanonicalJob(j)));
  const activeIndex = index || new InvertedIndex().build(canonicalJobs);
  const corpusStats = getCachedCorpusStats(canonicalJobs);
  const useV2Weights = weights && Object.prototype.hasOwnProperty.call(weights, "transferableSkills");
  const v2Weights = useV2Weights ? normalizeMatchWeights(weights, MATCH_WEIGHTS) : { ...MATCH_WEIGHTS };
  const w = useV2Weights ? v2Weights : normalizeWeights(weights);

  const normalizedCandSkills = [...new Set((candidateSkills || []).map(resolveSkillAlias).filter(Boolean))];
  const candSkillMap = new Map(normalizedCandSkills.map((s) => [s.toLowerCase(), s]));
  const candEvidences = extractSkillEvidences(candidateText, normalizedCandSkills);
  const candCtx = precomputeCandidateContext(candidateText);
  const expandedCandText = expandCrossLingualConcepts(`${normalizedCandSkills.join(" ")} ${(suggestedRoles || []).join(" ")} ${String(candidateText || "").slice(0, 1200)}`);
  const candQueryTerms = [...new Set(tokenize(expandedCandText))].slice(0, 42);
  const roleTokens = new Set(tokenize(expandCrossLingualConcepts((suggestedRoles || []).join(" "))));

  // Filtro rápido via Índice Invertido para searchQuery
  const searchQuery = String(filters.query || "").trim();
  const indexedQueryMatchIds = searchQuery ? activeIndex.search(searchQuery) : null;
  const normQuery = searchQuery ? normalizeText(searchQuery) : "";
  const normModality = filters.modality ? normalizeText(filters.modality) : "";
  const normSeniority = filters.jobSeniority ? normalizeText(filters.jobSeniority) : "";
  const normLanguage = filters.language ? normalizeText(filters.language) : "";
  const normSector = filters.sector ? normalizeText(filters.sector) : "";
  const normLocation = filters.location ? normalizeText(filters.location) : "";
  const minScore = Number(filters.minScore || 0);
  const fraudMode = String(filters.fraudMode || "hide_scam");
  const recencyFilter = String(filters.recency || "");
  const sortBy = String(filters.sortBy || "match").toLowerCase();
  const nowMs = Date.now();

  let embeddingsUsedCount = 0;
  let filteredFakeCount = 0;
  const results = [];

  for (const job of canonicalJobs) {
    let authenticity = _authCache.get(job);
    if (!authenticity) {
      authenticity = evaluateJobAuthenticity(job, { corpusStats });
      _authCache.set(job, authenticity);
    }
    if (fraudMode === "hide_scam" && authenticity.isFake) {
      filteredFakeCount++;
      continue;
    }
    if (fraudMode === "verified_only" && authenticity.isSuspicious) {
      filteredFakeCount++;
      continue;
    }

    // 1. Filtros duros configuráveis
    if (indexedQueryMatchIds !== null && !indexedQueryMatchIds.has(String(job.id))) {
      // Fallback substring exato caso token curto tenha sido filtrado
      const hay = normalizeText(`${job.title} ${job.company} ${job.location} ${(job.skills || []).join(" ")}`);
      if (!hay.includes(normQuery)) continue;
    }
    if (normModality && !normalizeText(job.modality || "").includes(normModality)) continue;
    if (normSeniority && !normalizeText(job.seniority || "").includes(normSeniority)) continue;
    if (normLanguage) {
      const jobLang = normalizeText(job.jobLanguage || "");
      const filterBase = normLanguage.split(/[-\s]/)[0];
      const jobBase = jobLang.split(/[-\s]/)[0];
      if (jobLang !== normLanguage && !(normLanguage.includes("-") && jobBase === filterBase)) continue;
    }
    if (normSector && !normalizeText(job.sector || "").includes(normSector)) continue;
    if (normLocation && !normalizeText(`${job.location || ""} ${job.country || ""}`).includes(normLocation)) continue;

    // Filtro de frescor (48h, 7d, 30d) para priorizar candidaturas rápidas
    let ageDays = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(String(job.posted_at || ""))) {
      const postedMs = Date.parse(String(job.posted_at).slice(0, 10));
      if (!Number.isNaN(postedMs)) {
        ageDays = Math.max(0, (nowMs - postedMs) / 86400000);
      }
    }
    if (recencyFilter === "48h" && (ageDays === null || ageDays > 2)) continue;
    if (recencyFilter === "7d" && (ageDays === null || ageDays > 7)) continue;
    if (recencyFilter === "30d" && (ageDays === null || ageDays > 30)) continue;

    const jobSkills = job.skills || [];
    const jobText = `${job.title || ""}\n${job.description || ""}`;

    // 1 & 2. Motor Avançado de Competências (Exata, Equivalência Técnica, Complementares, Proficiência e Evidências)
    const compEval = evaluateCompetencies({
      candEvidences,
      candidateSkills: normalizedCandSkills,
      jobSkills,
      jobText,
      relatedGraphFinder: (missingSkill, cMap, maxHop) => {
        const hits = findRelatedSkillsViaGraph([...cMap.values()], [missingSkill], maxHop);
        return hits;
      },
    });
    const matchedSkills = compEval.matchedSkills;
    const relatedMatches = compEval.relatedMatches;
    const missingSkills = compEval.missingSkills;

    let exactScore = compEval.exactScore !== null ? compEval.exactScore : null;
    if (jobSkills.length && exactScore !== null) {
      const titleSkills = getCachedTitleSkills(job.title);
      let matchedWeight = 0;
      let totalWeight = 0;
      for (const js of jobSkills) {
        const sw = titleSkills.has(js.toLowerCase()) ? 2.0 : 1.0;
        totalWeight += sw;
        if (candSkillMap.has(js.toLowerCase())) matchedWeight += sw;
      }
      const exactRatio = totalWeight > 0 ? Math.min(matchedWeight / totalWeight, 1) : 0;
      const exactBreadth = Math.min(matchedSkills.length / 4, 1);
      exactScore = 0.78 * exactRatio + 0.22 * exactBreadth;
    }

    const relatedScore =
      compEval.transferableScore !== null
        ? (missingSkills.length === 0 && relatedMatches.length === 0 && exactScore !== null ? exactScore : compEval.transferableScore)
        : null;

    // 3. Similaridade semântica híbrida multilíngue: Embeddings + BM25 + Conceitos Cross-Lingual
    const bm25Sim = activeIndex.bm25Score(candQueryTerms, job.id);
    const expandedJobTokens = new Set(tokenize(expandCrossLingualConcepts(jobText)));
    const crossHits = candQueryTerms.filter((t) => expandedJobTokens.has(t)).length;
    const crossSim = candQueryTerms.length ? Math.min(1, crossHits / Math.min(8, candQueryTerms.length)) : 0;
    const lexicalHybrid = Math.max(bm25Sim, 0.55 * bm25Sim + 0.45 * crossSim);

    const jobEmb = jobEmbeddings && jobEmbeddings.get ? jobEmbeddings.get(String(job.id)) : null;
    let embSim = null;
    let semanticMode = "bm25_fallback";
    let semanticScore = lexicalHybrid;
    if (candidateEmbedding && jobEmb) {
      embSim = cosineSimilarity(candidateEmbedding, jobEmb);
      semanticScore = 0.65 * embSim + 0.35 * lexicalHybrid;
      semanticMode = "minilm_bm25_hybrid";
      embeddingsUsedCount++;
    }

    // 4. Senioridade assimétrica (9 níveis + complexidade)
    let senScore = computeSeniorityScore(candidateSeniority, job.seniority || "Pleno", {
      candYears: candidateYears,
      candidateText,
    });
    if (candidateYears !== null && candidateYears !== undefined && job.experienceYears) {
      const diffYrs = candidateYears - job.experienceYears;
      const yrsScore = diffYrs >= 0 ? 1.0 : Math.max(0.30, 1.0 + diffYrs * 0.14);
      senScore = 0.75 * senScore + 0.25 * yrsScore;
    }

    // 5. Experiência contextual, Responsabilidades, Formação, Idiomas, Setor e Localização
    const expCtx = evaluateExperienceContext(candidateText, job, candEvidences, candCtx);
    const respEval = evaluateResponsibilities(candidateText, jobText, candCtx);
    const eduEval = evaluateEducation(candidateText, jobText, candCtx);
    const langEval = evaluateLanguages(candidateText, jobText, candCtx);
    const locEval = evaluateLocationModality(job, userCountry, filters);
    const hasReqKeywords = /(obrigatori|indispensavel|imprescindivel|required|must have|mandatory|desejavel|preferencial|diferencial|crea|oab|crm)/i.test(jobText);
    const mandatoryReqs = hasReqKeywords
      ? extractAndEvaluateRequirements(jobText, candCtx.norm, candEvidences, normalizedCandSkills)
      : [];

    const titleTokens = tokenize(expandCrossLingualConcepts(job.title || ""));
    const titleHit = titleTokens.some((t) => roleTokens.has(t));
    const sectorHit = candidateSector && normalizeText(job.sector || "") === normalizeText(candidateSector);
    const roleSectorScore = titleHit && sectorHit ? 1.0 : titleHit ? 0.85 : sectorHit ? 0.62 : Math.max(0.30, lexicalHybrid);

    // 6. Combinação 10D com tratamento neutro de dimensões ausentes (não atribui 0 a dados ausentes)
    const dimMap = {
      exactSkills: exactScore !== null ? exactScore : lexicalHybrid,
      transferableSkills: relatedScore !== null ? relatedScore : lexicalHybrid * 0.85,
      skillProficiency: compEval.proficiencyScore !== null ? compEval.proficiencyScore : null,
      professionalExperience: expCtx.score !== null ? Math.max(expCtx.score, lexicalHybrid * 0.8) : null,
      responsibilities: respEval.score,
      seniority: senScore,
      education: eduEval.score,
      languages: langEval.score,
      sectorContext: roleSectorScore,
      locationModality: locEval.score,
    };

    let weightedSum = 0;
    let activeWeightSum = 0;
    for (const [dim, val] of Object.entries(dimMap)) {
      if (val !== null && val !== undefined && Number.isFinite(val)) {
        const dw = v2Weights[dim] || 0;
        weightedSum += dw * val;
        activeWeightSum += dw;
      }
    }
    const baseWeighted = activeWeightSum > 0 ? weightedSum / activeWeightSum : lexicalHybrid;

    // Ajuste fino apenas por feedback explícito do usuário (voto != 0)
    const fb = feedbackMap[job.id];
    const feedbackBias = fb && fb.vote ? fb.vote * 5 : 0;
    const geo = classifyGeoPriority(job, userCountry);

    const scorePct = Math.round(Math.min(Math.max(baseWeighted * 100 + feedbackBias, 5), 99));
    if (scorePct < minScore) continue;

    const confCov = computeConfidenceAndCoverage({
      candidateText,
      jobDescription: job.description || "",
      candEvidences,
      dimensionScores: dimMap,
      embeddingsActive: embSim !== null,
    });

    const band = getScoreBand(scorePct);
    const compatibilityBand = getCompatibilityBand(scorePct);
    const highlightTerms = [
      ...matchedSkills,
      ...relatedMatches.map((r) => r.skill),
      ...titleTokens.filter((t) => roleTokens.has(t)),
    ];

    let reason = "Aderência por contexto semântico, responsabilidades e perfil profissional";
    if (matchedSkills.length && relatedMatches.length) {
      reason = `${matchedSkills.length} skill(s) exata(s) (${matchedSkills.slice(0, 3).join(", ")}) + ${relatedMatches.length} equivalente(s) (${relatedMatches.slice(0, 2).map((r) => `${r.skill}↔${r.via}`).join(", ")})`;
    } else if (matchedSkills.length) {
      reason = `${matchedSkills.length} de ${jobSkills.length} skills compatíveis (${matchedSkills.slice(0, 4).join(", ")})`;
    } else if (relatedMatches.length) {
      reason = `Competências transferíveis (${relatedMatches.slice(0, 3).map((r) => `${r.skill}↔${r.via}`).join(", ")})`;
    }

    const strengths = [];
    if (matchedSkills.length) strengths.push(`Competências exatas: ${matchedSkills.slice(0, 5).join(", ")}.`);
    if (compEval.complementary.length) strengths.push(`Sinergia complementar: ${compEval.complementary.map((c) => c.label).join("; ")}.`);
    if (expCtx.transferableExperiences.length) strengths.push(expCtx.transferableExperiences[0].rationale);
    if (respEval.matchedResponsibilities.length) strengths.push(`Responsabilidades alinhadas: ${respEval.matchedResponsibilities.join(", ")}.`);

    const weaknesses = [];
    const unverifiedMandatory = mandatoryReqs.filter((r) => r.category === "Obrigatório" || r.category === "Legal").filter((r) => r.state !== "Atendido");
    if (unverifiedMandatory.length) weaknesses.push(`${unverifiedMandatory.length} requisito(s) obrigatório(s)/legal(is) sem comprovação explícita.`);
    if (missingSkills.length) weaknesses.push(`Competências não identificadas: ${missingSkills.slice(0, 4).join(", ")}.`);
    if (langEval.details) weaknesses.push(langEval.details);
    if (locEval.restrictions.length) weaknesses.push(locEval.restrictions[0]);

    const optimizationTips = [];
    if (missingSkills.length) optimizationTips.push(`Se possuir vivência com ${missingSkills.slice(0, 3).join(", ")}, inclua exemplos práticos no currículo.`);
    if (relatedMatches.length) optimizationTips.push(`Destaque transição rápida de ${relatedMatches[0].via} para ${relatedMatches[0].skill}.`);
    if (confCov.matchConfidence < 50) optimizationTips.push("Adicione mais detalhes de projetos e métricas no currículo para elevar a confiança da avaliação.");

    const toPct = (v) => (v !== null && v !== undefined && Number.isFinite(v) ? Math.round(v * 100) : null);

    results.push({
      ...job,
      match_score: scorePct,
      match_confidence: confCov.matchConfidence,
      job_authenticity_score: Math.max(0, 100 - (authenticity?.riskScore || 0)),
      data_coverage: confCov.dataCoverage,
      score_band: band,
      compatibility_band: compatibilityBand,
      semantic_mode: semanticMode,
      score_breakdown: {
        exactSkills: toPct(dimMap.exactSkills) ?? 0,
        transferableSkills: toPct(dimMap.transferableSkills) ?? 0,
        skillProficiency: toPct(dimMap.skillProficiency) ?? 0,
        professionalExperience: toPct(dimMap.professionalExperience) ?? 0,
        responsibilities: toPct(dimMap.responsibilities) ?? 0,
        seniority: toPct(dimMap.seniority) ?? 0,
        education: toPct(dimMap.education) ?? 0,
        languages: toPct(dimMap.languages) ?? 0,
        sectorContext: toPct(dimMap.sectorContext) ?? 0,
        locationModality: toPct(dimMap.locationModality) ?? 0,
        // Aliases de compatibilidade com a UI/testes v1
        relatedSkills: toPct(dimMap.transferableSkills) ?? 0,
        skills: Math.round(Math.min((dimMap.exactSkills || 0) * 0.78 + (dimMap.transferableSkills || 0) * 0.22, 1) * 100),
        semantic: Math.round(semanticScore * 100),
        bm25: Math.round(bm25Sim * 100),
        embedding: embSim !== null ? Math.round(embSim * 100) : null,
        roleSector: Math.round(roleSectorScore * 100),
        role: Math.round(roleSectorScore * 100),
        geoBonus: 0,
        filtersPassed: true,
      },
      mandatory_requirements: mandatoryReqs,
      matched_skills: matchedSkills,
      related_matches: relatedMatches.slice(0, 5),
      related_skills: relatedMatches.slice(0, 4).map((r) => r.skill),
      missing_skills: missingSkills.slice(0, 6),
      transferable_experience: expCtx.transferableExperiences,
      evidence: compEval.evidences,
      strengths,
      weaknesses,
      optimization_tips: optimizationTips,
      missing_dimensions: confCov.missingDimensions,
      highlight_terms: [...new Set(highlightTerms)],
      match_reason: reason,
      geo_scope: geo.scope,
      geo_label: geo.label,
      salary_numeric: parseSalaryValue(job.salary || ""),
      pitch_suggestion: buildBilingualPitch(job, matchedSkills, relatedMatches, candidateSeniority),
      authenticity,
      isFresh48h: ageDays !== null && ageDays <= 2,
      isDirectAts: /greenhouse|lever|ashby|smartrecruiters|gupy|carreira direta/i.test(String(job.source || "")),
    });
  }

  // Ranking: Score final, com tie-breaking por recência e fonte de confiança
  if (sortBy === "salary") {
    results.sort(
      (a, b) =>
        b.salary_numeric - a.salary_numeric ||
        b.match_score - a.match_score ||
        postedSortKey(b.posted_at).localeCompare(postedSortKey(a.posted_at))
    );
  } else if (sortBy === "recent") {
    results.sort(
      (a, b) =>
        postedSortKey(b.posted_at).localeCompare(postedSortKey(a.posted_at)) ||
        b.match_score - a.match_score ||
        getSourceTrust(b.source) - getSourceTrust(a.source)
    );
  } else {
    results.sort(
      (a, b) =>
        b.match_score - a.match_score ||
        postedSortKey(b.posted_at).localeCompare(postedSortKey(a.posted_at)) ||
        getSourceTrust(b.source) - getSourceTrust(a.source) ||
        b.matched_skills.length - a.matched_skills.length
    );
  }

  const elapsedMs = Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) * 100) / 100;
  const quality = computeRankingQualityMetrics(results, feedbackMap, 10);

  return {
    jobs: results,
    metrics: {
      searchTimeMs: elapsedMs,
      indexedCount: activeIndex.size,
      matchedCount: results.length,
      filteredFakeCount,
      embeddingsActive: embeddingsUsedCount > 0,
      embeddingsCoverage: results.length ? Math.round((embeddingsUsedCount / results.length) * 100) : 0,
      weights: w,
      quality,
    },
  };
}

export function computeSkillGaps(rankedJobs, topN = 12) {
  const sample = rankedJobs.slice(0, topN);
  if (!sample.length) return [];
  const counts = new Map();
  for (const j of sample) {
    for (const s of j.missing_skills || []) counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([skill, count]) => ({
      skill,
      demand_count: count,
      demand_pct: Math.round((count / sample.length) * 100),
    }));
}

export function compareCustomJob({
  jobTitle,
  jobDescription,
  candidateSkills,
  candidateText,
  candidateSeniority,
  candidateSector = "",
  suggestedRoles = [],
  userCountry = "Brasil",
}) {
  const synthetic = extractCanonicalJob({
    id: "custom-job",
    title: jobTitle || "Vaga Personalizada",
    company: "Vaga Colada",
    location: "Conforme descrição",
    salary: "A combinar",
    description: jobDescription,
    url: "#",
    source: "Comparação Direta",
    posted_at: new Date().toISOString().slice(0, 10),
  });

  const { jobs } = matchJobsHybrid({
    jobs: [synthetic],
    candidateSkills: candidateSkills || [],
    candidateText: candidateText || "",
    candidateSeniority: candidateSeniority || "Pleno",
    candidateSector,
    suggestedRoles,
    userCountry,
    filters: { fraudMode: "show_all", minScore: 0 },
  });
  const matched = jobs[0];
  if (!matched) {
    return {
      ...synthetic,
      match_score: 0,
      match_confidence: 15,
      data_coverage: 0,
      matched_skills: [],
      related_matches: [],
      missing_skills: [],
      optimization_tips: ["Forneça mais detalhes da vaga e do currículo para calcular a compatibilidade."],
    };
  }

  const tips = [...(matched.optimization_tips || [])];
  if (matched.match_score >= 80) {
    tips.push("Alta aderência (≥80)! Personalize o título do currículo para esta vaga e candidate-se.");
  } else if (!tips.length) {
    tips.push("Adapte os bullets da sua última experiência usando as palavras-chave destacadas da descrição.");
  }
  return { ...matched, optimization_tips: [...new Set(tips)] };
}
