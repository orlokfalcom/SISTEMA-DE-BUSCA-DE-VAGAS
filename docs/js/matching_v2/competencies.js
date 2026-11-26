/**
 * VagaPulse AI 2.0 — Motor Avançado de Competências
 * Avalia: Correspondência Exata, Equivalência Técnica Contextual, Competências Complementares,
 * Nível de Proficiência (1..5) e Evidências Rastreáveis (declarada vs. demonstrada).
 */

import { normalizeText, resolveSkillAlias } from "../nlp.js";

export const PROFICIENCY_LABELS = {
  1: "Conhecimento básico",
  2: "Conhecimento intermediário",
  3: "Conhecimento avançado",
  4: "Especialista",
  5: "Experiência comprovada em projetos",
};

/**
 * Equivalências técnicas reais com distância tecnológica explícita (0..1).
 * Não agrupa tecnologias apenas por pertencerem à mesma categoria genérica.
 */
export const TECHNICAL_EQUIVALENCE_MAP = {
  PostgreSQL: [{ skill: "MySQL", distance: 0.88, context: "Bancos relacionais SQL" }],
  MySQL: [{ skill: "PostgreSQL", distance: 0.88, context: "Bancos relacionais SQL" }],
  React: [
    { skill: "Vue.js", distance: 0.82, context: "SPA / Component-based UI" },
    { skill: "Next.js", distance: 0.90, context: "Ecossistema React SSR/SSG" },
  ],
  "Vue.js": [{ skill: "React", distance: 0.82, context: "SPA / Component-based UI" }],
  AWS: [
    { skill: "Azure", distance: 0.82, context: "Cloud pública IaaS/PaaS" },
    { skill: "GCP", distance: 0.82, context: "Cloud pública IaaS/PaaS" },
  ],
  Azure: [
    { skill: "AWS", distance: 0.82, context: "Cloud pública IaaS/PaaS" },
    { skill: "GCP", distance: 0.80, context: "Cloud pública IaaS/PaaS" },
  ],
  GCP: [
    { skill: "AWS", distance: 0.82, context: "Cloud pública IaaS/PaaS" },
    { skill: "Azure", distance: 0.80, context: "Cloud pública IaaS/PaaS" },
  ],
  Pandas: [{ skill: "Polars", distance: 0.86, context: "DataFrames e manipulação tabular em Python" }],
  Polars: [{ skill: "Pandas", distance: 0.86, context: "DataFrames e manipulação tabular em Python" }],
  TensorFlow: [{ skill: "PyTorch", distance: 0.85, context: "Deep Learning / Redes Neurais" }],
  PyTorch: [{ skill: "TensorFlow", distance: 0.85, context: "Deep Learning / Redes Neurais" }],
  Excel: [
    { skill: "Power BI", distance: 0.76, context: "Análise tabular e BI" },
    { skill: "SQL", distance: 0.70, context: "Consulta e análise estruturada de dados" },
  ],
  "Power BI": [{ skill: "Excel", distance: 0.78, context: "Modelagem tabular e indicadores" }],
  FastAPI: [
    { skill: "Django", distance: 0.82, context: "Backend web Python" },
    { skill: "Flask", distance: 0.88, context: "Microserviços Python" },
  ],
  Flask: [{ skill: "FastAPI", distance: 0.88, context: "APIs REST em Python" }],
  Django: [{ skill: "FastAPI", distance: 0.82, context: "APIs e serviços Python" }],
  Docker: [{ skill: "Kubernetes", distance: 0.75, context: "Contêineres e orquestração" }],
  "Node.js": [{ skill: "TypeScript", distance: 0.76, context: "Runtime e tipagem JS/TS" }],
  JavaScript: [{ skill: "TypeScript", distance: 0.86, context: "Linguagem ECMAScript" }],
  TypeScript: [{ skill: "JavaScript", distance: 0.92, context: "Superset ECMAScript" }],
};

export const COMPLEMENTARY_SYNERGIES = [
  { trigger: ["SQL", "Python"], bonusSkills: ["Pandas", "Power BI", "ETL"], label: "Stack analítica Python + SQL" },
  { trigger: ["Java", "Spring"], bonusSkills: ["REST", "Microservices", "Docker"], label: "Ecossistema corporativo Java + Spring" },
  { trigger: ["SIEM", "Segurança da Informação"], bonusSkills: ["SOC", "Incident Response", "Python"], label: "Operação de defesa cibernética + SIEM" },
  { trigger: ["Python", "Machine Learning"], bonusSkills: ["Estatística", "Pandas", "Scikit-learn", "TensorFlow", "PyTorch"], label: "Pipeline de Ciência de Dados & ML" },
  { trigger: ["React", "TypeScript"], bonusSkills: ["Next.js", "Tailwind", "Jest"], label: "Frontend moderno tipado" },
];

const SKILL_CATEGORIES = {
  Python: "Linguagem",
  JavaScript: "Linguagem",
  TypeScript: "Linguagem",
  Java: "Linguagem",
  SQL: "Dados & Banco",
  PostgreSQL: "Dados & Banco",
  MySQL: "Dados & Banco",
  Pandas: "Dados & IA",
  Polars: "Dados & IA",
  "Power BI": "Dados & BI",
  Excel: "Dados & BI",
  TensorFlow: "Dados & IA",
  PyTorch: "Dados & IA",
  React: "Frontend",
  "Vue.js": "Frontend",
  "Next.js": "Frontend",
  FastAPI: "Backend",
  Django: "Backend",
  Flask: "Backend",
  "Node.js": "Backend",
  AWS: "Cloud & DevOps",
  Azure: "Cloud & DevOps",
  GCP: "Cloud & DevOps",
  Docker: "Cloud & DevOps",
  Kubernetes: "Cloud & DevOps",
  SIEM: "Cibersegurança",
};

function inferLevelFromContext(snippet) {
  const lower = normalizeText(snippet);
  if (/(arquitet|lider|producao|production|escal|milhoes|millions|reduc|otimiz|projeto|project|entreg|built|developed|implemented|implementou|desenvolveu)/.test(lower)) {
    return { level: 5, origin: "demonstrated", confidence: 0.9 };
  }
  if (/(especialista|expert|avancad|advanced|senior|profundo|deep)/.test(lower)) {
    return { level: 4, origin: "demonstrated", confidence: 0.82 };
  }
  if (/(intermediari|intermediate|pratic|hands on|experiencia com|experience with)/.test(lower)) {
    return { level: 3, origin: "demonstrated", confidence: 0.76 };
  }
  if (/(basico|basic|nocoes|familiaridade|introducao|cursando)/.test(lower)) {
    return { level: 1, origin: "declared", confidence: 0.65 };
  }
  return { level: 2, origin: "declared", confidence: 0.7 };
}

function extractYearsNearSkill(snippet) {
  const m = String(snippet || "").match(/(\d+)\s*\+?\s*(?:anos?|years?|yrs?)/i);
  return m ? Math.min(30, parseInt(m[1], 10)) : null;
}

/**
 * Extrai evidências estruturadas de cada competência no currículo (sem presumir nível avançado por repetição).
 */
export function extractSkillEvidences(candidateText = "", declaredSkills = []) {
  const lines = String(candidateText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const allSkills = [...new Set((declaredSkills || []).map(resolveSkillAlias).filter(Boolean))];
  const evidences = new Map();

  for (const skill of allSkills) {
    const skillNorm = normalizeText(skill);
    const matchingLines = lines.filter((l) => normalizeText(l).includes(skillNorm));
    let bestLevel = 2;
    let origin = "declared";
    let confidence = 0.68;
    let yearsProven = null;
    const projects = [];
    const experiences = [];

    for (const line of matchingLines) {
      const inf = inferLevelFromContext(line);
      if (inf.level > bestLevel) {
        bestLevel = inf.level;
        origin = inf.origin;
        confidence = inf.confidence;
      }
      const yrs = extractYearsNearSkill(line);
      if (yrs !== null) yearsProven = Math.max(yearsProven || 0, yrs);
      if (/(projeto|project|sistema|app|plataforma|dashboard|api)/i.test(line)) {
        projects.push(line.slice(0, 140));
      } else {
        experiences.push(line.slice(0, 140));
      }
    }

    evidences.set(skill.toLowerCase(), {
      canonical: skill,
      synonyms: [],
      category: SKILL_CATEGORIES[skill] || "Competência Técnica",
      level: bestLevel,
      levelLabel: PROFICIENCY_LABELS[bestLevel],
      yearsProven,
      projects: projects.slice(0, 3),
      experiences: experiences.slice(0, 3),
      origin: matchingLines.length ? origin : "declared",
      confidence: matchingLines.length ? confidence : 0.6,
    });
  }

  return evidences;
}

function inferJobRequiredProficiency(jobText = "", skill = "") {
  const normJob = normalizeText(jobText);
  const sk = normalizeText(skill);
  const sentences = normJob.split(/[.!?\n]/).filter((s) => s.includes(sk));
  for (const s of sentences) {
    if (/(especialista|expert|avancad|advanced|solido|solid|deep|architect)/.test(s)) return 4;
    if (/(projeto|production|producao|hands on|experiencia)/.test(s)) return 3;
    if (/(basico|basic|desejavel|nice to have|diferencial|plus)/.test(s)) return 1;
  }
  return 3;
}

/**
 * Avalia correspondência exata, equivalência técnica, competências complementares e proficiência.
 */
export function evaluateCompetencies({
  candEvidences,
  candidateSkills = [],
  jobSkills = [],
  jobText = "",
  relatedGraphFinder = null,
}) {
  const normalizedCand = [...new Set((candidateSkills || []).map(resolveSkillAlias).filter(Boolean))];
  const candMap = new Map(normalizedCand.map((s) => [s.toLowerCase(), s]));
  const normalizedJob = [...new Set((jobSkills || []).map(resolveSkillAlias).filter(Boolean))];

  const matchedSkills = [];
  const relatedMatches = [];
  const missingSkills = [];
  const proficiencyScores = [];
  const evidences = [];

  for (const jSkill of normalizedJob) {
    const key = jSkill.toLowerCase();
    if (candMap.has(key)) {
      const canonical = candMap.get(key);
      matchedSkills.push(canonical);
      const ev = candEvidences.get(key) || {
        canonical,
        level: 2,
        levelLabel: PROFICIENCY_LABELS[2],
        origin: "declared",
        confidence: 0.65,
      };
      const reqLevel = inferJobRequiredProficiency(jobText, canonical);
      const ratio = ev.level >= reqLevel ? 1.0 : Math.max(0.45, ev.level / reqLevel);
      proficiencyScores.push(ratio);
      evidences.push({
        type: "exact_skill",
        skill: canonical,
        origin: ev.origin,
        level: ev.level,
        levelLabel: ev.levelLabel,
        requiredLevel: reqLevel,
        confidence: ev.confidence,
        source: ev.projects?.[0] || ev.experiences?.[0] || "Lista de competências do currículo",
      });
      continue;
    }

    // Equivalência técnica contextual
    const equivList = TECHNICAL_EQUIVALENCE_MAP[jSkill] || [];
    let foundEquiv = null;
    for (const eq of equivList) {
      if (candMap.has(eq.skill.toLowerCase())) {
        foundEquiv = {
          skill: jSkill,
          via: candMap.get(eq.skill.toLowerCase()),
          distance: eq.distance,
          context: eq.context,
          hop: 1,
          weight: eq.distance,
        };
        break;
      }
    }

    if (!foundEquiv && typeof relatedGraphFinder === "function") {
      const graphMatches = relatedGraphFinder(jSkill, candMap, 2);
      if (graphMatches && graphMatches.length) {
        const g = graphMatches[0];
        foundEquiv = {
          skill: jSkill,
          via: g.via,
          distance: g.hop === 1 ? 0.72 : 0.52,
          context: "Grafo de competências relacionadas",
          hop: g.hop,
          weight: g.weight,
        };
      }
    }

    if (foundEquiv) {
      relatedMatches.push(foundEquiv);
      proficiencyScores.push(foundEquiv.distance * 0.85);
      evidences.push({
        type: "transferable_skill",
        skill: jSkill,
        via: foundEquiv.via,
        distance: foundEquiv.distance,
        context: foundEquiv.context,
        confidence: Math.round(foundEquiv.distance * 100) / 100,
        source: `Equivalência técnica com ${foundEquiv.via}`,
      });
    } else {
      missingSkills.push(jSkill);
    }
  }

  // Sinergias complementares
  const complementary = [];
  for (const syn of COMPLEMENTARY_SYNERGIES) {
    const hasTrigger = syn.trigger.every((t) => candMap.has(t.toLowerCase()));
    if (hasTrigger) {
      const extra = syn.bonusSkills.filter((b) => candMap.has(b.toLowerCase()));
      if (extra.length) {
        complementary.push({ label: syn.label, skills: [...syn.trigger, ...extra] });
      }
    }
  }

  const totalJobSkills = normalizedJob.length;
  const exactScore = totalJobSkills > 0 ? matchedSkills.length / totalJobSkills : null;
  const transferableBase = totalJobSkills > 0
    ? Math.min(1, relatedMatches.reduce((acc, r) => acc + r.distance, 0) / Math.max(1, totalJobSkills - matchedSkills.length || totalJobSkills))
    : null;
  const complementaryBonus = Math.min(0.25, complementary.length * 0.1);
  const transferableScore = transferableBase !== null ? Math.min(1, transferableBase + complementaryBonus) : null;
  const proficiencyScore = proficiencyScores.length
    ? proficiencyScores.reduce((a, b) => a + b, 0) / proficiencyScores.length
    : null;

  return {
    exactScore,
    transferableScore,
    proficiencyScore,
    matchedSkills,
    relatedMatches,
    missingSkills,
    complementary,
    evidences,
  };
}
