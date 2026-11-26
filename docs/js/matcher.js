/**
 * VagaPulse AI — Motor de Matching Híbrido Explicável, Feedback Loop & Avaliação
 */

import {
  SENIORITY_LEVELS,
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

export const DEFAULT_WEIGHTS = {
  exactSkills: 0.42,
  relatedSkills: 0.13,
  semantic: 0.22,
  seniority: 0.13,
  roleSector: 0.10,
};

const WEIGHT_BOUNDS = { min: 0.05, max: 0.65 };

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
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
}

/**
 * Penalidade gradativa de senioridade (nunca eliminação binária).
 */
export function computeSeniorityScore(candidateSeniority, jobSeniority) {
  const cNorm = normalizeSeniority(candidateSeniority);
  const jNorm = normalizeSeniority(jobSeniority);
  const cLvl = SENIORITY_LEVELS[cNorm] || 3;
  const jLvl = SENIORITY_LEVELS[jNorm] || 3;
  const diff = Math.abs(cLvl - jLvl);
  const table = { 0: 1.0, 1: 0.78, 2: 0.48, 3: 0.22, 4: 0.08 };
  return table[diff] ?? 0.08;
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

  if (isUserCountry) {
    return { scope: "local_country", label: `${countryNorm === "brasil" ? "🇧🇷" : "📍"} ${userCountry}`, bonus: 5 };
  }
  const globalSignals = ["anywhere", "worldwide", "remoto global", "latam", "south america", "americas", "global"];
  if (globalSignals.some((s) => hay.includes(s))) {
    return { scope: "global_remote", label: "🌎 Global / LATAM", bonus: 2 };
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
 * Normaliza vetor de pesos para somar 1.0 respeitando limites seguros.
 */
export function normalizeWeights(weights) {
  const out = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  let sum = 0;
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const clamped = Math.max(WEIGHT_BOUNDS.min, Math.min(WEIGHT_BOUNDS.max, Number(out[key]) || DEFAULT_WEIGHTS[key]));
    out[key] = clamped;
    sum += clamped;
  }
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    out[key] = Math.round((out[key] / sum) * 1000) / 1000;
  }
  return out;
}

/**
 * Atualiza pesos locais (regressão leve / bandit contextual) a partir de feedback 👍 (reward=+1) ou 👎 (reward=-1).
 */
export function adaptWeightsFromFeedback(currentWeights, breakdown, reward, lr = 0.035) {
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

  // Atualiza cada peso proporcionalmente à diferença do componente em relação à média da vaga
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const signal = features[key] - meanFeature;
    updated[key] = updated[key] + lr * reward * signal;
  }
  return normalizeWeights(updated);
}

/**
 * Calcula Precision@K e métricas de qualidade do ranking com base nos feedbacks/cliques do usuário.
 */
export function computeRankingQualityMetrics(rankedJobs, feedbackMap = {}, k = 10) {
  const topK = rankedJobs.slice(0, k);
  let evaluatedTopK = 0;
  let positivesTopK = 0;
  let totalLikes = 0;
  let totalDislikes = 0;
  let totalClicks = 0;

  for (const fb of Object.values(feedbackMap || {})) {
    if (!fb) continue;
    if (fb.vote === 1) totalLikes++;
    if (fb.vote === -1) totalDislikes++;
    if (fb.clicked) totalClicks++;
  }

  for (const job of topK) {
    const fb = feedbackMap[job.id];
    if (!fb) continue;
    if (fb.vote === 1 || fb.vote === -1 || fb.clicked) {
      evaluatedTopK++;
      if (fb.vote === 1 || (fb.clicked && fb.vote !== -1)) positivesTopK++;
    }
  }

  // Pseudo-métrica Precision@10: quando há avaliações explícitas no top-K usa razão real;
  // caso contrário estima aderência pela proporção de vagas de faixa Alta/Média no Top-K.
  const highOrMidCount = topK.filter((j) => j.match_score >= 60).length;
  const precisionAtK = evaluatedTopK > 0
    ? Math.round((positivesTopK / evaluatedTopK) * 100)
    : (topK.length ? Math.round((highOrMidCount / topK.length) * 100) : 0);

  return {
    k,
    precisionAtK,
    isUserMeasured: evaluatedTopK > 0,
    evaluatedTopK,
    positivesTopK,
    totalLikes,
    totalDislikes,
    totalClicks,
  };
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
  const canonicalJobs = jobs.map((j) => (j.canonical ? j : extractCanonicalJob(j)));
  const activeIndex = index || new InvertedIndex().build(canonicalJobs);
  const corpusStats = buildCorpusStats(canonicalJobs);
  const w = normalizeWeights(weights);

  const normalizedCandSkills = [...new Set(candidateSkills.map(resolveSkillAlias).filter(Boolean))];
  const candSkillMap = new Map(normalizedCandSkills.map((s) => [s.toLowerCase(), s]));
  const candQueryTerms = [
    ...new Set(tokenize(`${normalizedCandSkills.join(" ")} ${suggestedRoles.join(" ")} ${candidateText.slice(0, 1200)}`)),
  ].slice(0, 36);
  const roleTokens = new Set(tokenize(suggestedRoles.join(" ")));

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
    const authenticity = evaluateJobAuthenticity(job, { corpusStats });
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
    const matchedSkills = [];
    const rawMissing = [];
    for (const js of jobSkills) {
      if (candSkillMap.has(js.toLowerCase())) matchedSkills.push(js);
      else rawMissing.push(js);
    }

    // 2. Grafo de competências com decaimento por distância (hop 1 = 0.55, hop 2 = 0.25)
    const relatedMatches = findRelatedSkillsViaGraph(normalizedCandSkills, rawMissing, 2);
    const relatedSkillNames = new Set(relatedMatches.map((r) => r.skill));
    const missingSkills = rawMissing.filter((s) => !relatedSkillNames.has(s));

    let exactScore = 0.28;
    let relatedScore = 0;
    if (jobSkills.length) {
      // Skills mencionadas diretamente no título da vaga têm peso 2.0 (críticas)
      const titleSkills = new Set(extractSkillsCanonical(job.title || "").map((s) => s.toLowerCase()));
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

      if (rawMissing.length === 0) {
        // Cobertura exata de 100% não deve perder os pontos do grafo por ausência de gaps
        relatedScore = exactScore;
      } else {
        const weightedRelatedHits = relatedMatches.reduce((acc, r) => acc + r.weight, 0);
        const remainingDenom = Math.max(jobSkills.length - matchedSkills.length, 1);
        relatedScore = Math.min(weightedRelatedHits / remainingDenom, 1);
      }
    }

    // 3. Similaridade semântica híbrida: Embeddings locais (MiniLM) + BM25 (fallback elegante para BM25 puro)
    const bm25Sim = activeIndex.bm25Score(candQueryTerms, job.id);
    const jobEmb = jobEmbeddings && jobEmbeddings.get ? jobEmbeddings.get(String(job.id)) : null;
    let embSim = null;
    let semanticMode = "bm25_fallback";
    let semanticScore = bm25Sim;
    if (candidateEmbedding && jobEmb) {
      embSim = cosineSimilarity(candidateEmbedding, jobEmb);
      semanticScore = 0.65 * embSim + 0.35 * bm25Sim;
      semanticMode = "minilm_bm25_hybrid";
      embeddingsUsedCount++;
    }

    // 4. Senioridade + alinhamento de anos de experiência (penalidade gradativa)
    let senScore = computeSeniorityScore(candidateSeniority, job.seniority || "Pleno");
    if (candidateYears !== null && candidateYears !== undefined && job.experienceYears) {
      const diffYrs = candidateYears - job.experienceYears;
      const yrsScore = diffYrs >= 0 ? 1.0 : Math.max(0.25, 1.0 + diffYrs * 0.15);
      senScore = 0.75 * senScore + 0.25 * yrsScore;
    }

    // 5. Afinidade de cargo + setor
    const titleTokens = tokenize(job.title || "");
    const titleHit = titleTokens.some((t) => roleTokens.has(t));
    const sectorHit = candidateSector && normalizeText(job.sector || "") === normalizeText(candidateSector);
    const roleSectorScore = titleHit && sectorHit ? 1.0 : titleHit ? 0.85 : sectorHit ? 0.62 : 0.30;

    // Quando a vaga não possui skills estruturadas, redistribui peso para semântica/cargo
    let baseWeighted;
    if (jobSkills.length) {
      baseWeighted =
        w.exactSkills * exactScore +
        w.relatedSkills * relatedScore +
        w.semantic * semanticScore +
        w.seniority * senScore +
        w.roleSector * roleSectorScore;
    } else {
      baseWeighted = 0.56 * semanticScore + 0.24 * senScore + 0.20 * roleSectorScore;
    }

    // Ajuste fino por feedback direto do usuário na vaga ou nas skills da vaga
    const fb = feedbackMap[job.id];
    const feedbackBias = fb && fb.vote ? fb.vote * 6 : 0;
    const geo = classifyGeoPriority(job, userCountry);

    const scorePct = Math.round(Math.min(Math.max(baseWeighted * 100 + geo.bonus + feedbackBias, 5), 99));
    if (scorePct < minScore) continue;

    const band = getScoreBand(scorePct);
    const highlightTerms = [
      ...matchedSkills,
      ...relatedMatches.map((r) => r.skill),
      ...titleTokens.filter((t) => roleTokens.has(t)),
    ];

    let reason = "Aderência por contexto semântico e perfil profissional";
    if (matchedSkills.length && relatedMatches.length) {
      reason = `${matchedSkills.length} skill(s) exata(s) (${matchedSkills.slice(0, 3).join(", ")}) + ${relatedMatches.length} por grafo (${relatedMatches.slice(0, 2).map((r) => `${r.skill}↔${r.via}`).join(", ")})`;
    } else if (matchedSkills.length) {
      reason = `${matchedSkills.length} de ${jobSkills.length} skills compatíveis (${matchedSkills.slice(0, 4).join(", ")})`;
    } else if (relatedMatches.length) {
      reason = `Proximidade no grafo de competências (${relatedMatches.slice(0, 3).map((r) => `${r.skill} [hop ${r.hop}]`).join(", ")})`;
    }

    results.push({
      ...job,
      match_score: scorePct,
      score_band: band,
      semantic_mode: semanticMode,
      score_breakdown: {
        exactSkills: Math.round(exactScore * 100),
        relatedSkills: Math.round(relatedScore * 100),
        skills: Math.round(Math.min(exactScore * 0.78 + relatedScore * 0.22, 1) * 100),
        semantic: Math.round(semanticScore * 100),
        bm25: Math.round(bm25Sim * 100),
        embedding: embSim !== null ? Math.round(embSim * 100) : null,
        seniority: Math.round(senScore * 100),
        roleSector: Math.round(roleSectorScore * 100),
        role: Math.round(roleSectorScore * 100),
        geoBonus: geo.bonus,
        filtersPassed: true,
      },
      matched_skills: matchedSkills,
      related_matches: relatedMatches.slice(0, 5),
      related_skills: relatedMatches.slice(0, 4).map((r) => r.skill),
      missing_skills: missingSkills.slice(0, 6),
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
    candidateSkills,
    candidateText,
    candidateSeniority,
    candidateSector,
    suggestedRoles,
    userCountry,
  });
  const matched = jobs[0];

  const tips = [];
  if (matched.missing_skills.length) {
    tips.push(`Se você possui experiência com ${matched.missing_skills.slice(0, 4).join(", ")}, mencione explicitamente no currículo com exemplos práticos.`);
  }
  if (matched.related_matches.length) {
    tips.push(`Você já tem base próxima via grafo em ${matched.related_matches.slice(0, 3).map((r) => `${r.skill} (${r.via})`).join(", ")} — destaque sua facilidade de transição.`);
  }
  if (matched.match_score >= 80) {
    tips.push("Alta aderência (≥80)! Personalize o título do currículo para esta vaga e candidate-se.");
  } else {
    tips.push("Adapte os bullets da sua última experiência usando as palavras-chave destacadas da descrição.");
  }
  return { ...matched, optimization_tips: tips };
}
