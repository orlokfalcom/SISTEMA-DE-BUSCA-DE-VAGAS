/**
 * Schemas e validação defensiva para entrada de vaga e saída de análise antifraude.
 */

import { safeSliceText } from "../utils/normalization.js";

export function validateJobInput(job) {
  if (!job || typeof job !== "object") {
    return {
      id: "unknown",
      title: "",
      company: "",
      description: "",
      location: "",
      modality: "",
      seniority: "",
      salary: "",
      url: "",
      source: "",
      posted_at: "",
      skills: [],
    };
  }
  return {
    ...job,
    id: safeSliceText(job.id || "unknown", 128),
    title: safeSliceText(job.title || "", 300),
    company: safeSliceText(job.company || "", 200),
    description: safeSliceText(job.description || "", 12000),
    location: safeSliceText(job.location || "", 200),
    modality: safeSliceText(job.modality || "", 80),
    seniority: safeSliceText(job.seniority || "", 80),
    salary: safeSliceText(job.salary || "", 120),
    url: safeSliceText(job.url || "", 2048),
    source: safeSliceText(job.source || "", 120),
    posted_at: safeSliceText(job.posted_at || "", 64),
    skills: Array.isArray(job.skills) ? job.skills.slice(0, 60).map((s) => safeSliceText(s, 80)) : [],
  };
}

export function validateAnalysisOutput(result) {
  const riskScore = Math.max(0, Math.min(100, Math.round(Number(result?.riskScore) || 0)));
  const confidence = Math.max(0, Math.min(100, Math.round(Number(result?.confidence) || 0)));
  return {
    riskScore,
    status: String(result?.status || "Dados insuficientes"),
    confidence,
    isFake: Boolean(result?.isFake),
    isSuspicious: Boolean(result?.isSuspicious),
    signals: Array.isArray(result?.signals) ? result.signals : [],
    recommendations: Array.isArray(result?.recommendations) ? result.recommendations : [],
    ghostJob: result?.ghostJob || { status: "Não avaliada", ageDays: null, isGhost: false, signals: [] },
    domainAnalysis: result?.domainAnalysis || null,
    companyAnalysis: result?.companyAnalysis || null,
    categoryScores: result?.categoryScores || {},
    aiAssisted: Boolean(result?.aiAssisted),
    traceId: String(result?.traceId || ""),
  };
}
