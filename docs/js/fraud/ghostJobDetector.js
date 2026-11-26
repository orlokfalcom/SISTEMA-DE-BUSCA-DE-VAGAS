/**
 * CAMADA 4 — Detecção de Ghost Jobs (classificação independente de fraude)
 */

import { normalizeText } from "./utils/normalization.js";

const CLOSED_MARKERS = /\b(vaga\s+encerrada|inscricoes\s+encerradas|processo\s+finalizado|no\s+longer\s+accepting\s+applications|position\s+filled|job\s+closed|offre\s+pourvue|vacante\s+cerrada)\b/i;

export function detectGhostJob(job, corpusStats = null, nowMs = Date.now()) {
  const signals = [];
  const postedRaw = String(job.posted_at || "").trim();
  const desc = `${job.title || ""} ${job.description || ""}`;
  let ageDays = null;

  if (/^\d{4}-\d{2}-\d{2}/.test(postedRaw)) {
    const parsedMs = Date.parse(postedRaw.slice(0, 10));
    if (!Number.isNaN(parsedMs)) {
      if (parsedMs > nowMs + 7 * 86400000) {
        signals.push("Data de publicação inconsistente no futuro");
      } else {
        ageDays = Math.max(0, Math.round((nowMs - parsedMs) / 86400000));
      }
    }
  }

  const isClosed = CLOSED_MARKERS.test(normalizeText(desc));
  if (isClosed) {
    signals.push("Texto indica candidatura ou processo já encerrado");
  }

  const dupCount = corpusStats?.titleCompanyCounts?.get(
    `${normalizeText(job.title)}::${normalizeText(job.company)}`
  ) || 1;
  if (dupCount >= 3) {
    signals.push(`Anúncio republicado repetidamente (${dupCount} ocorrências no lote)`);
  }

  let status = "Recente";
  if (isClosed || (ageDays !== null && ageDays > 120)) {
    status = "Forte evidência de anúncio inativo";
    if (ageDays !== null && ageDays > 120) signals.push(`Ativa há ${ageDays} dias (> 120 dias)`);
  } else if ((ageDays !== null && ageDays > 60) || dupCount >= 3) {
    status = "Suspeita de Ghost Job";
    if (ageDays !== null && ageDays > 60) signals.push(`Ativa há ${ageDays} dias (> 60 dias)`);
  } else if (ageDays !== null && ageDays > 30) {
    status = "Possivelmente desatualizada";
    signals.push(`Publicada há ${ageDays} dias (> 30 dias)`);
  } else if (ageDays === null && !signals.length) {
    status = "Recente";
  }

  return {
    status,
    ageDays,
    isGhost: status === "Suspeita de Ghost Job" || status === "Forte evidência de anúncio inativo",
    signals,
  };
}
