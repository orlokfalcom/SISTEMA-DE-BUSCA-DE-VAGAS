/**
 * VagaPulse AI 2.0 — Analisadores Contextuais Multidimensionais
 * Experiência Profissional, Responsabilidades (13 categorias), Requisitos, Senioridade 9 níveis,
 * Formação/Certificações, Idiomas CEFR, Localização/Modalidade e Confiança/Cobertura.
 */

import { normalizeText, resolveSkillAlias } from "../nlp.js";

// ==================== 1. SENIORIDADE (9 NÍVEIS + TÍTULOS INTERNACIONAIS) ====================
export const EXTENDED_SENIORITY_SCALE = {
  "Estágio": 1,
  "Júnior": 2,
  "Pleno": 3,
  "Sênior": 4,
  "Especialista": 5,
  "Tech Lead": 6,
  "Coordenador": 7,
  "Gerente": 8,
  "Diretor": 9,
};

const INTL_SENIORITY_ALIASES = [
  [/\b(intern|estagi[oa]|trainee|apprentice)\b/i, "Estágio"],
  [/\b(junior|jr\.?|entry[- ]level|associate)\b/i, "Júnior"],
  [/\b(pleno|mid[- ]level|intermediate|regular)\b/i, "Pleno"],
  [/\b(senior|sr\.?|s[êe]nior)\b/i, "Sênior"],
  [/\b(specialist|especialista|staff|principal)\b/i, "Especialista"],
  [/\b(tech\s*lead|team\s*lead|lead\s+engineer|engineering\s+lead|l[íi]der\s+t[ée]cnico)\b/i, "Tech Lead"],
  [/\b(coordinator|coordenador|supervisor)\b/i, "Coordenador"],
  [/\b(manager|gerente|head\s+of|engineering\s+manager)\b/i, "Gerente"],
  [/\b(director|diretor|vp|vice\s+president|cto|cio|ciso)\b/i, "Diretor"],
];

export function normalizeExtendedSeniority(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return "Pleno";
  for (const [re, label] of INTL_SENIORITY_ALIASES) {
    if (re.test(txt)) return label;
  }
  return EXTENDED_SENIORITY_SCALE[txt] ? txt : "Pleno";
}

/**
 * Avaliação assimétrica e contextual de senioridade:
 * - Não penaliza automaticamente profissionais experientes aplicando a cargos de menor senioridade.
 * - Combina nível, complexidade, autonomia e entregas (não apenas diferença numérica ou anos).
 */
export function computeSeniorityScoreV2(candidateSeniority, jobSeniority, { candYears = null, candidateText = "" } = {}) {
  const cNorm = normalizeExtendedSeniority(candidateSeniority);
  const jNorm = normalizeExtendedSeniority(jobSeniority);
  const cLvl = EXTENDED_SENIORITY_SCALE[cNorm] || 3;
  const jLvl = EXTENDED_SENIORITY_SCALE[jNorm] || 3;

  const normCand = normalizeText(candidateText);
  const complexitySignals = /(arquitet|lider|mentoria|decisao|autonomia|roadmap|gestao|escala|reducao|otimizacao|architect|led|mentored|ownership|strategy)/.test(normCand);

  if (cLvl === jLvl) return 1.0;

  // Candidato mais experiente que a vaga: não penaliza automaticamente (leve ajuste apenas se diferença extrema de gestão)
  if (cLvl > jLvl) {
    const overGap = cLvl - jLvl;
    return overGap <= 2 ? 0.95 : Math.max(0.82, 0.95 - (overGap - 2) * 0.04);
  }

  // Candidato abaixo do nível pedido: penalidade gradativa mitigada por complexidade/autonomia demonstrada
  const underGap = jLvl - cLvl;
  const baseMap = { 1: 0.78, 2: 0.50, 3: 0.25, 4: 0.12 };
  let score = baseMap[underGap] ?? 0.10;
  if (complexitySignals) score = Math.min(0.92, score + 0.12);
  if (Number.isFinite(candYears) && candYears >= jLvl * 1.5) score = Math.min(0.9, score + 0.08);
  return Math.round(score * 1000) / 1000;
}

// ==================== 2. RESPONSABILIDADES (13 CATEGORIAS) ====================
export const RESPONSIBILITY_CATEGORIES = [
  { id: "Desenvolvimento", re: /\b(desenvolv|program|codif|implement|constru|api|software|backend|frontend|build|develop|code|engineer)/i },
  { id: "Gestão", re: /\b(gestao|gerenci|coorden|orcamento|stakeholder|kpi|okr|manage|budget|deliver|scrum|agile)/i },
  { id: "Operação", re: /\b(operac|deploy|ci\/cd|monitor|observab|infra|devops|sre|pipeline|incident|operate|maintain|uptime)/i },
  { id: "Análise", re: /\b(analis|dados|metric|relatorio|indicador|bi|dashboard|sql|analytics|analyze|insights|model)/i },
  { id: "Segurança", re: /\b(seguranc|vulnerab|pentest|siem|soc|lgpd|gdpr|owasp|criptograf|security|audit|compliance|defense)/i },
  { id: "Arquitetura", re: /\b(arquitet|microsservic|escalabil|design\s+system|distributed|system\s+design|architect|cloud\s+architecture)/i },
  { id: "Suporte", re: /\b(suporte|chamado|troubleshooting|helpdesk|n1|n2|n3|support|debug|resolve\s+issues)/i },
  { id: "Pesquisa", re: /\b(pesquis|inovac|poc|prototipo|experimento|ml|ia|research|r&d|experiment|paper)/i },
  { id: "Comunicação", re: /\b(comunicac|apresent|alinhamento|document|stakeholder|collaborat|present|cross-functional)/i },
  { id: "Liderança", re: /\b(lider|mentoria|orientar|tech\s+lead|coach|lead\s+team|mentor|guiding)/i },
  { id: "Documentação", re: /\b(documentac|especificac|rfc|readme|wiki|manual|documentation|technical\s+writing)/i },
  { id: "Atendimento", re: /\b(atendimento|cliente|usuario|cs|customer|client\s+facing|onboarding)/i },
  { id: "Planejamento", re: /\b(planej|roadmap|estrateg|backlog|estimativa|planning|strategy|prioritiz)/i },
];

export function extractResponsibilities(text = "") {
  const norm = normalizeText(text);
  const found = [];
  for (const cat of RESPONSIBILITY_CATEGORIES) {
    if (cat.re.test(norm)) found.push(cat.id);
  }
  return found;
}

export function precomputeCandidateContext(candidateText = "") {
  const raw = String(candidateText || "");
  const norm = normalizeText(raw);
  return {
    raw,
    norm,
    responsibilities: new Set(extractResponsibilities(norm)),
    outcomeMatches: raw.match(/\b(\d+\s*%|reduc[aã]o|aumento|otimiz|escal|milh[õo]es|milhares|latency|throughput|uptime)\b/gi) || [],
    autonomySignals: /(autonomia|lider|responsavel por|owner|end-to-end|de ponta a ponta|decisao|arquitet)/i.test(norm),
    hasDegree: /(bacharelado|tecnologo|licenciatura|graduacao|pos-graduacao|mestrado|doutorado|bachelor|master|mba|ciencia da computacao|engenharia|sistemas de informacao|analise e desenvolvimento|cst)/i.test(norm),
    hasCert: /(aws certified|azure|comptia|cissp|ceh|security\+|scrum|pmp|oracle|cisco|ccna|certificad)/i.test(norm),
    englishCefr: parseCefrFromText(raw, /\b(ingles|english)\b/),
  };
}

export function evaluateResponsibilities(candidateText = "", jobText = "", candCtx = null) {
  const jobResp = extractResponsibilities(jobText);
  if (!jobResp.length) {
    return { score: null, jobResponsibilities: [], matchedResponsibilities: [], missingResponsibilities: [] };
  }
  const candSet = candCtx ? candCtx.responsibilities : new Set(extractResponsibilities(candidateText));
  const matched = jobResp.filter((r) => candSet.has(r));
  const missing = jobResp.filter((r) => !candSet.has(r));
  return {
    score: matched.length / jobResp.length,
    jobResponsibilities: jobResp,
    matchedResponsibilities: matched,
    missingResponsibilities: missing,
  };
}

// ==================== 3. EXPERIÊNCIA CONTEXTUAL & TRANSFERÍVEL ====================
const TRANSFERABLE_ROLE_FAMILIES = [
  {
    name: "Engenharia & Sistemas",
    patterns: [/\b(analista de sistemas|systems analyst|desenvolvedor|software engineer|programador|engenheiro de software)\b/i],
    signals: ["api", "arquitetura", "integracao", "dados", "sql", "backend", "frontend", "cloud", "automacao"],
  },
  {
    name: "Dados & Analytics",
    patterns: [/\b(analista de dados|data analyst|cientista de dados|data scientist|engenheiro de dados|data engineer|bi)\b/i],
    signals: ["sql", "python", "etl", "power bi", "pandas", "estatistica", "modelo", "dashboard"],
  },
  {
    name: "Segurança & Infraestrutura",
    patterns: [/\b(seguranca|security|soc|devsecops|infraestrutura|sysadmin|redes|sre)\b/i],
    signals: ["linux", "firewall", "siem", "cloud", "aws", "azure", "docker", "monitoramento", "vulnerabilidade"],
  },
];

export function evaluateExperienceContext(candidateText = "", job = {}, candEvidences = new Map(), candCtx = null) {
  const normCand = candCtx ? candCtx.norm : normalizeText(candidateText);
  const normJob = normalizeText(`${job.title || ""} ${job.description || ""}`);
  if (!normCand) return { score: null, transferableExperiences: [], demonstratedOutcomes: [] };

  const outcomeMatches = candCtx ? candCtx.outcomeMatches : (candidateText.match(/\b(\d+\s*%|reduc[aã]o|aumento|otimiz|escal|milh[õo]es|milhares|latency|throughput|uptime)\b/gi) || []);
  const autonomySignals = candCtx ? candCtx.autonomySignals : /(autonomia|lider|responsavel por|owner|end-to-end|de ponta a ponta|decisao|arquitet)/i.test(normCand);

  const demonstratedCount = [...candEvidences.values()].filter((e) => e.origin === "demonstrated").length;
  const totalSkills = Math.max(1, candEvidences.size);
  const demonstratedRatio = demonstratedCount / totalSkills;

  const transferableExperiences = [];
  for (const fam of TRANSFERABLE_ROLE_FAMILIES) {
    const jobHits = fam.signals.filter((s) => normJob.includes(s));
    const candHits = fam.signals.filter((s) => normCand.includes(s));
    const overlap = jobHits.filter((s) => candHits.includes(s));
    if (overlap.length >= 2) {
      transferableExperiences.push({
        family: fam.name,
        sharedSignals: overlap,
        rationale: `Experiência prática transferível em ${fam.name} (${overlap.slice(0, 4).join(", ")})`,
      });
    }
  }

  let score = 0.35 + demonstratedRatio * 0.35;
  if (outcomeMatches.length >= 1) score += Math.min(0.18, outcomeMatches.length * 0.06);
  if (autonomySignals) score += 0.12;
  if (transferableExperiences.length) score += 0.10;

  return {
    score: Math.min(1, Math.round(score * 1000) / 1000),
    transferableExperiences,
    demonstratedOutcomes: [...new Set(outcomeMatches)].slice(0, 5),
  };
}

// ==================== 4. REQUISITOS OBRIGATÓRIOS, DESEJÁVEIS E LEGAIS ====================
export function extractAndEvaluateRequirements(jobDescription = "", candidateText = "", candEvidences = new Map(), candSkills = []) {
  const lines = String(jobDescription || "").split(/\r?\n|(?<=[.!?])\s+/).map((l) => l.trim()).filter((l) => l.length > 8);
  const normCand = normalizeText(candidateText);
  const candSet = new Set((candSkills || []).map((s) => resolveSkillAlias(s).toLowerCase()));
  const results = [];

  for (const line of lines.slice(0, 25)) {
    const lower = normalizeText(line);
    let category = null;
    if (/(obrigatori|indispensavel|imprescindivel|required|must have|mandatory|exigencia legal|registro ativo|crea|oab|crm)/i.test(lower)) {
      category = /(registro ativo|crea|oab|crm|exigencia legal|conselho regional)/i.test(lower) ? "Legal" : "Obrigatório";
    } else if (/(desejavel|preferencial|preferred|nice to have|plus)/i.test(lower)) {
      category = "Desejável";
    } else if (/(diferencial|bonus|sera um plus)/i.test(lower)) {
      category = "Diferencial";
    }
    if (!category) continue;

    // Identifica skills citadas na linha do requisito
    const tokens = [...candSet].filter((sk) => lower.includes(sk));
    const hasTextOverlap = tokens.length > 0 || lower.split(/\s+/).filter((w) => w.length > 5 && normCand.includes(w)).length >= 2;

    let state = "Não identificado";
    let certainty = 45;
    let evidenceFound = "";
    let evidenceMissing = "";

    if (tokens.length > 0) {
      state = "Atendido";
      certainty = 88;
      evidenceFound = `Competência comprovada/declarada: ${tokens.join(", ")}`;
    } else if (hasTextOverlap) {
      state = "Parcialmente atendido";
      certainty = 65;
      evidenceFound = "Contexto semelhante identificado no histórico profissional.";
      evidenceMissing = "Termo/requisito explícito não citado literalmente.";
    } else if (!normCand) {
      state = "Necessita confirmação";
      certainty = 25;
      evidenceMissing = "Currículo sem detalhamento suficiente para confirmar este item.";
    } else {
      state = category === "Legal" ? "Não atendido" : "Não identificado";
      certainty = category === "Legal" ? 80 : 55;
      evidenceMissing = "Evidência não localizada no currículo enviado.";
    }

    results.push({
      requirement: line.slice(0, 160),
      category,
      state,
      evidenceFound: evidenceFound || null,
      evidenceMissing: evidenceMissing || null,
      certainty,
      impact: category === "Legal" ? "Crítico (regulatório)" : (category === "Obrigatório" ? "Alto" : "Moderado/Baixo"),
    });
  }

  return results;
}

// ==================== 5. FORMAÇÃO E CERTIFICAÇÕES ====================
export function evaluateEducation(candidateText = "", jobText = "", candCtx = null) {
  const normCand = candCtx ? candCtx.norm : normalizeText(candidateText);
  const normJob = normalizeText(jobText);

  const jobNeedsLegalDegree = /(crm|oab|crea|conselho regional|diploma obrigatorio|formacao obrigatoria em medicina|direito|enfermagem)/i.test(normJob);
  const jobPrefersDegree = /(graduacao|bacharelado|tecnologo|ensino superior|bachelor|degree|computer science|ciencia da computacao|sistemas de informacao)/i.test(normJob);
  const jobIsPreferenceOnly = /(desejavel|preferencial|ou experiencia equivalente|or equivalent experience)/i.test(normJob);

  const candHasDegree = candCtx ? candCtx.hasDegree : /(bacharelado|tecnologo|licenciatura|graduacao|pos-graduacao|mestrado|doutorado|bachelor|master|mba|ciencia da computacao|engenharia|sistemas de informacao|analise e desenvolvimento|cst)/i.test(normCand);
  const candHasCert = candCtx ? candCtx.hasCert : /(aws certified|azure|comptia|cissp|ceh|security\+|scrum|pmp|oracle|cisco|ccna|certificad)/i.test(normCand);

  if (!jobNeedsLegalDegree && !jobPrefersDegree) {
    return { score: normCand ? (candHasDegree || candHasCert ? 0.95 : 0.85) : null, requirementType: "none" };
  }
  if (jobNeedsLegalDegree) {
    return { score: candHasDegree ? 1.0 : 0.15, requirementType: "legal" };
  }
  if (candHasDegree) {
    return { score: candHasCert ? 1.0 : 0.92, requirementType: "matched" };
  }
  if (jobIsPreferenceOnly) {
    return { score: candHasCert ? 0.85 : 0.72, requirementType: "preference" };
  }
  return { score: candHasCert ? 0.72 : 0.55, requirementType: "company_required" };
}

// ==================== 6. IDIOMAS (CEFR A1-C2) ====================
const CEFR_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

function parseCefrFromText(text, langRegex) {
  const m = String(text || "").match(new RegExp(`${langRegex.source}[^\\n.;]{0,45}`, "i"));
  if (!m) return null;
  const seg = normalizeText(m[0]);
  const cefrMatch = seg.match(/\b(a1|a2|b1|b2|c1|c2)\b/i);
  if (cefrMatch) return cefrMatch[1].toUpperCase();
  if (/(nativo|native|fluente|fluent|bilingue|bilingual)/.test(seg)) return "C2";
  if (/(avancad|advanced|proficient)/.test(seg)) return "C1";
  if (/(intermediari|intermediate|conversacao)/.test(seg)) return "B2";
  if (/(basico|basic|leitura|technical)/.test(seg)) return "A2";
  return "B1";
}

export function evaluateLanguages(candidateText = "", jobText = "", candCtx = null) {
  const normJob = normalizeText(jobText);
  const englishMentioned = /\b(ingles|english)\b/i.test(normJob);
  const englishMandatory = /(ingles\s+(?:avancado|fluente|obrigatorio)|fluent\s+english|english\s+required|working\s+language\s+is\s+english)/i.test(normJob);
  const spanishMentioned = /\b(espanhol|spanish)\b/i.test(normJob);

  if (!englishMentioned && !spanishMentioned) {
    return { score: null, details: "Sem exigência explícita de idioma estrangeiro na vaga." };
  }

  let score = 0.8;
  const details = [];
  if (englishMentioned) {
    const reqLevel = englishMandatory ? "C1" : "B1";
    const candLevel = candCtx ? candCtx.englishCefr : parseCefrFromText(candidateText, /\b(ingles|english)\b/);
    if (!candLevel) {
      score = englishMandatory ? 0.45 : 0.72;
      details.push(`Inglês (${reqLevel}) citado na vaga; proficiência não declarada no currículo.`);
    } else {
      const diff = CEFR_RANK[candLevel] - CEFR_RANK[reqLevel];
      score = diff >= 0 ? 1.0 : Math.max(0.4, 1 + diff * 0.18);
      details.push(`Inglês: candidato ${candLevel} vs. referência ${reqLevel}.`);
    }
  }
  return { score: Math.round(score * 1000) / 1000, details: details.join(" ") };
}

// ==================== 7. LOCALIZAÇÃO E MODALIDADE (INDEPENDENTE) ====================
export function evaluateLocationModality(job = {}, userCountry = "Brasil", candidatePrefs = {}) {
  const loc = normalizeText(`${job.location || ""} ${job.modality || ""}`);
  const isRemote = /(remoto|remote|anywhere|worldwide|home office)/i.test(loc);
  const isHybrid = /(hibrid|hybrid)/i.test(loc);
  const prefModality = normalizeText(candidatePrefs.modality || "");

  let score = 0.75;
  if (prefModality) {
    score = loc.includes(prefModality) ? 1.0 : (isRemote ? 0.85 : 0.55);
  } else if (isRemote) {
    score = 0.95;
  } else if (isHybrid) {
    score = 0.82;
  }

  const restrictions = [];
  if (/(us only|eu only|visa sponsorship not|sem visto|work authorization)/i.test(normalizeText(job.description || ""))) {
    restrictions.push("Possível restrição de autorização de trabalho/país na descrição.");
    if (!loc.includes(normalizeText(userCountry))) score = Math.min(score, 0.5);
  }

  return { score, restrictions };
}

// ==================== 8. CONFIANÇA DA AVALIAÇÃO & COBERTURA DE DADOS ====================
export function computeConfidenceAndCoverage({
  candidateText = "",
  jobDescription = "",
  candEvidences = new Map(),
  dimensionScores = {},
  embeddingsActive = false,
}) {
  const dimValues = Object.values(dimensionScores);
  const availableDims = dimValues.filter((v) => v !== null && v !== undefined && Number.isFinite(v)).length;
  const dataCoverage = Math.round((availableDims / Math.max(1, dimValues.length)) * 100);

  const resumeQuality = Math.min(1, String(candidateText || "").trim().length / 600);
  const jobQuality = Math.min(1, String(jobDescription || "").trim().length / 350);
  const demonstratedCount = [...candEvidences.values()].filter((e) => e.origin === "demonstrated").length;
  const evidenceDensity = candEvidences.size ? Math.min(1, demonstratedCount / Math.max(1, candEvidences.size) + 0.3) : 0.25;

  const rawConf =
    (dataCoverage / 100) * 0.35 +
    resumeQuality * 0.25 +
    jobQuality * 0.20 +
    evidenceDensity * 0.15 +
    (embeddingsActive ? 0.05 : 0);

  const matchConfidence = Math.max(15, Math.min(99, Math.round(rawConf * 100)));
  const missingDimensions = Object.entries(dimensionScores)
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);

  return {
    matchConfidence,
    dataCoverage,
    missingDimensions,
  };
}
