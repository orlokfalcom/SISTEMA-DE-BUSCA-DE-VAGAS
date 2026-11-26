/**
 * VagaPulse AI 2.0 — Matriz de Pesos 10D, Perfis por Família Profissional & Versionamento
 */

export const WEIGHT_VERSION = "2.0.0";

export const MATCH_WEIGHTS = {
  exactSkills: 0.25,
  transferableSkills: 0.10,
  skillProficiency: 0.10,
  professionalExperience: 0.15,
  responsibilities: 0.10,
  seniority: 0.08,
  education: 0.05,
  languages: 0.07,
  sectorContext: 0.05,
  locationModality: 0.05,
};

export const V2_WEIGHT_BOUNDS = { min: 0.02, max: 0.45 };

export const ROLE_FAMILY_WEIGHT_PROFILES = {
  default: { ...MATCH_WEIGHTS },
  software_engineering: {
    exactSkills: 0.26,
    transferableSkills: 0.11,
    skillProficiency: 0.11,
    professionalExperience: 0.15,
    responsibilities: 0.10,
    seniority: 0.08,
    education: 0.03,
    languages: 0.06,
    sectorContext: 0.05,
    locationModality: 0.05,
  },
  data_ai: {
    exactSkills: 0.25,
    transferableSkills: 0.10,
    skillProficiency: 0.12,
    professionalExperience: 0.14,
    responsibilities: 0.10,
    seniority: 0.07,
    education: 0.07,
    languages: 0.06,
    sectorContext: 0.05,
    locationModality: 0.04,
  },
  cybersecurity: {
    exactSkills: 0.24,
    transferableSkills: 0.10,
    skillProficiency: 0.12,
    professionalExperience: 0.16,
    responsibilities: 0.12,
    seniority: 0.08,
    education: 0.04,
    languages: 0.06,
    sectorContext: 0.05,
    locationModality: 0.03,
  },
  leadership_management: {
    exactSkills: 0.16,
    transferableSkills: 0.10,
    skillProficiency: 0.08,
    professionalExperience: 0.20,
    responsibilities: 0.16,
    seniority: 0.12,
    education: 0.05,
    languages: 0.06,
    sectorContext: 0.04,
    locationModality: 0.03,
  },
};

function sanitizeNumber(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normaliza qualquer vetor de pesos garantindo limites, proteção contra NaN/Infinity/negativos
 * e soma exata igual a 1.0000 (compensando erro de arredondamento no maior componente).
 */
export function normalizeMatchWeights(weights, template = MATCH_WEIGHTS, bounds = V2_WEIGHT_BOUNDS) {
  const keys = Object.keys(template);
  const clamped = {};
  let sum = 0;

  for (const key of keys) {
    const raw = weights && Object.prototype.hasOwnProperty.call(weights, key) ? weights[key] : template[key];
    const safe = sanitizeNumber(raw, template[key]);
    const val = Math.max(bounds.min, Math.min(bounds.max, safe));
    clamped[key] = val;
    sum += val;
  }

  if (!Number.isFinite(sum) || sum <= 0) {
    return { ...template };
  }

  const out = {};
  let roundedSum = 0;
  let maxKey = keys[0];
  for (const key of keys) {
    const normalized = Math.round((clamped[key] / sum) * 10000) / 10000;
    out[key] = normalized;
    roundedSum += normalized;
    if (out[key] > out[maxKey]) maxKey = key;
  }

  const residual = Math.round((1 - roundedSum) * 10000) / 10000;
  if (residual !== 0) {
    out[maxKey] = Math.round((out[maxKey] + residual) * 10000) / 10000;
  }
  return out;
}

export function validateWeights(weights, template = MATCH_WEIGHTS) {
  const keys = Object.keys(template);
  let sum = 0;
  for (const k of keys) {
    const v = Number(weights?.[k]);
    if (!Number.isFinite(v) || v < 0) return { valid: false, sum: NaN, reason: `Invalid weight for ${k}` };
    sum += v;
  }
  const diff = Math.abs(sum - 1);
  return { valid: diff < 0.001, sum: Math.round(sum * 10000) / 10000, diff };
}

export function getCompatibilityBand(score) {
  const s = Number.isFinite(Number(score)) ? Number(score) : 0;
  if (s >= 90) return { key: "excellent", label: "Excelente", css: "score-high" };
  if (s >= 80) return { key: "very_high", label: "Muito alta", css: "score-high" };
  if (s >= 70) return { key: "high", label: "Alta", css: "score-high" };
  if (s >= 60) return { key: "moderate", label: "Moderada", css: "score-mid" };
  if (s >= 40) return { key: "low", label: "Baixa", css: "score-low" };
  return { key: "very_low", label: "Muito baixa", css: "score-low" };
}
