/**
 * CAMADA 3 — Análise de Reputação Empresarial (sem invenção de CNPJ, endereço ou avaliações)
 */

import { normalizeText } from "./utils/normalization.js";

const GENERIC_COMPANY_NAMES = new Set([
  "", "empresa", "confidencial", "nao informado", "n/a", "unknown", "company", "anonymous",
  "recrutamento", "selecao", "rh", "confidential", "stealth",
]);

const KNOWN_ATS_SOURCES = ["greenhouse", "lever", "ashby", "workday", "gupy", "remotive", "himalayas"];

export function analyzeCompanyReputation(job, domainInfo = null, corpusStats = null) {
  const company = String(job.company || "").trim();
  const normCompany = normalizeText(company);
  const sourceNorm = normalizeText(job.source || "");
  const signals = [];

  let positiveEvidenceCount = 0;
  if (normCompany.length >= 2 && !GENERIC_COMPANY_NAMES.has(normCompany)) {
    positiveEvidenceCount++;
  } else {
    signals.push({
      ruleId: "generic_or_missing_company",
      category: "company_inconsistency",
      severity: "medium",
      weight: 9,
      description: "Nome da empresa ausente, confidencial ou genérico demais para verificação.",
      evidence: company || "Vazio",
      source: "company",
    });
  }

  if (domainInfo && domainInfo.valid && domainInfo.isHttps && domainInfo.companyMatchesDomain) {
    positiveEvidenceCount++;
  }

  if (KNOWN_ATS_SOURCES.some((ats) => sourceNorm.includes(ats) || (domainInfo?.hostname || "").includes(ats))) {
    positiveEvidenceCount++;
  }

  // Consistência de uso do mesmo domínio por muitas empresas diferentes no lote
  if (corpusStats && domainInfo?.hostname && !domainInfo.isKnownPortalOrAts) {
    const companiesOnDomain = corpusStats.domainToCompanies?.get(domainInfo.hostname);
    if (companiesOnDomain && companiesOnDomain.size >= 4) {
      signals.push({
        ruleId: "shared_suspicious_domain",
        category: "company_inconsistency",
        severity: "high",
        weight: 12,
        description: "Várias empresas diferentes utilizando o mesmo domínio não-institucional.",
        evidence: `${domainInfo.hostname} (${companiesOnDomain.size} empresas)`,
        source: "company",
      });
    }
  }

  let status = "Empresa sem informações suficientes";
  if (signals.some((s) => s.severity === "high" || s.severity === "critical")) {
    status = "Empresa com sinais suspeitos";
  } else if (signals.length > 0 && positiveEvidenceCount === 0) {
    status = "Empresa com sinais suspeitos";
  } else if (positiveEvidenceCount >= 3 && signals.length === 0) {
    status = "Empresa verificada";
  } else if (positiveEvidenceCount >= 2 && signals.length === 0) {
    status = "Empresa com evidências positivas";
  }

  return {
    signals,
    companyInfo: {
      name: company || "Não informado",
      status,
      positiveEvidenceCount,
    },
  };
}
