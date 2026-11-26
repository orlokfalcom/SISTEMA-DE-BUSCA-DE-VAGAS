/**
 * CAMADA 5 & DETECÇÃO DE DUPLICIDADE/CAMPANHAS — Análise Comportamental em Lote
 * Usa SimHash 32-bit, hash FNV-1a e agrupamento de contatos/domínios/títulos.
 */

import { computeSimHash, fnv1aHash, normalizeText, simHashSimilarity } from "./utils/normalization.js";
import { parseSafeUrl } from "./utils/urlSafety.js";

const CONTACT_REGEX = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:\+?\d{1,3}[\s-]?)?\(?\d{2,3}\)?[\s-]?\d{4,5}[-\s]?\d{4})/gi;

export function buildCorpusStats(jobs = []) {
  const descHashCounts = new Map();
  const titleCompanyCounts = new Map();
  const domainToCompanies = new Map();
  const contactToCompanies = new Map();
  const simHashes = [];

  for (const job of jobs) {
    if (!job || typeof job !== "object") continue;
    const normDesc = normalizeText(job.description || "");
    const normTitle = normalizeText(job.title || "");
    const normCompany = normalizeText(job.company || "");

    if (normDesc.length >= 30) {
      const dh = fnv1aHash(normDesc);
      descHashCounts.set(dh, (descHashCounts.get(dh) || 0) + 1);
      simHashes.push({ id: job.id, company: normCompany, title: normTitle, simHash: computeSimHash(normDesc) });
    }

    const tcKey = `${normTitle}::${normCompany}`;
    titleCompanyCounts.set(tcKey, (titleCompanyCounts.get(tcKey) || 0) + 1);

    const parsed = parseSafeUrl(job.url || "");
    if (parsed.valid && parsed.hostname) {
      if (!domainToCompanies.has(parsed.hostname)) domainToCompanies.set(parsed.hostname, new Set());
      if (normCompany) domainToCompanies.get(parsed.hostname).add(normCompany);
    }

    const contacts = String(job.description || "").match(CONTACT_REGEX) || [];
    for (const c of contacts) {
      const nc = c.toLowerCase().trim();
      if (!contactToCompanies.has(nc)) contactToCompanies.set(nc, new Set());
      if (normCompany) contactToCompanies.get(nc).add(normCompany);
    }
  }

  return { descHashCounts, titleCompanyCounts, domainToCompanies, contactToCompanies, simHashes };
}

export function analyzeBehaviorAndCampaigns(job, corpusStats = null) {
  const signals = [];
  const normDesc = normalizeText(job.description || "");
  const normCompany = normalizeText(job.company || "");
  const normTitle = normalizeText(job.title || "");

  if (corpusStats && normDesc.length >= 30) {
    const dh = fnv1aHash(normDesc);
    const exactDupCount = corpusStats.descHashCounts.get(dh) || 1;
    if (exactDupCount >= 3) {
      signals.push({
        ruleId: "mass_identical_description",
        category: "fraudulent_behavior",
        severity: "high",
        weight: 8,
        description: "Mesma descrição replicada em massa em múltiplos anúncios.",
        evidence: `${exactDupCount} anúncios com descrição idêntica`,
        source: "behavior",
      });
    } else {
      // SimHash cross-check contra outros títulos/empresas
      const sh = computeSimHash(normDesc);
      let nearMatches = 0;
      for (const item of corpusStats.simHashes) {
        if (item.id === job.id) continue;
        if (item.company !== normCompany && item.title !== normTitle && simHashSimilarity(sh, item.simHash) >= 0.9) {
          nearMatches++;
          if (nearMatches >= 2) break;
        }
      }
      if (nearMatches >= 2) {
        signals.push({
          ruleId: "simhash_campaign_cluster",
          category: "fraudulent_behavior",
          severity: "medium",
          weight: 6,
          description: "Campanha suspeita: descrição quase idêntica publicada sob empresas/títulos diferentes.",
          evidence: `${nearMatches + 1} anúncios similares via SimHash`,
          source: "behavior",
        });
      }
    }

    const contacts = String(job.description || "").match(CONTACT_REGEX) || [];
    for (const c of contacts) {
      const set = corpusStats.contactToCompanies.get(c.toLowerCase().trim());
      if (set && set.size >= 3) {
        signals.push({
          ruleId: "reused_contact_across_companies",
          category: "fraudulent_behavior",
          severity: "high",
          weight: 8,
          description: "Mesmo telefone ou e-mail reutilizado por múltiplas empresas diferentes.",
          evidence: c,
          source: "behavior",
        });
        break;
      }
    }
  }

  return { signals };
}
