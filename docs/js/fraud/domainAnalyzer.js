/**
 * CAMADA 2 — Inteligência de URLs e Domínios (com proteção SSRF e typosquatting)
 */

import { levenshteinDistance, parseSafeUrl } from "./utils/urlSafety.js";
import { normalizeText } from "./utils/normalization.js";

const SHORTENER_HOSTS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rb.gy", "shorturl.at", "t.me",
]);

const EXTERNAL_FORM_HOSTS = new Set([
  "forms.gle", "docs.google.com", "typeform.com", "jotform.com", "surveymonkey.com", "tally.so",
]);

const SUSPICIOUS_TLDS = new Set(["xyz", "top", "click", "tk", "ml", "ga", "cf", "gq", "pw", "buzz", "work", "loan"]);

const KNOWN_TRUSTED_BRANDS = [
  "google", "microsoft", "amazon", "apple", "meta", "netflix", "nubank", "mercadolivre", "itau",
  "bradesco", "santander", "petrobras", "stone", "vtex", "quintoandar", "greenhouse", "lever",
  "ashbyhq", "workday", "gupy", "linkedin", "indeed", "glassdoor", "remotive", "remoteok",
];

function extractRegistrableLabel(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return parts[0] || "";
  // trata .com.br, .co.uk
  const lastTwo = parts.slice(-2).join(".");
  if (/^(com|org|net|co|gov|edu)\.[a-z]{2}$/.test(lastTwo) && parts.length >= 3) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}

export function analyzeDomainAndUrl(job) {
  const rawUrl = String(job.url || "").trim();
  const companyNorm = normalizeText(job.company || "").replace(/[^a-z0-9]/g, "");
  const signals = [];

  if (!rawUrl || rawUrl === "#") {
    return {
      signals: [
        {
          ruleId: "missing_url",
          category: "domain_url",
          severity: "low",
          weight: 4,
          description: "A vaga não possui URL verificável de origem ou candidatura.",
          evidence: "URL ausente",
          source: "url",
        },
      ],
      domainInfo: { valid: false, hostname: null, isHttps: false, ssrfBlocked: false },
    };
  }

  const parsed = parseSafeUrl(rawUrl);
  if (!parsed.valid) {
    return {
      signals: [
        {
          ruleId: "malformed_or_unsafe_url",
          category: "domain_url",
          severity: parsed.reason === "dangerous_scheme" ? "critical" : "medium",
          weight: parsed.reason === "dangerous_scheme" ? 15 : 8,
          description: `URL malformada ou esquema inseguro (${parsed.reason}).`,
          evidence: rawUrl.slice(0, 100),
          source: "url",
        },
      ],
      domainInfo: { valid: false, hostname: null, isHttps: false, ssrfBlocked: true },
    };
  }

  const { hostname, protocol, ssrfBlocked, hasCredentialsInUrl, isPunycode } = parsed;
  const isHttps = protocol === "https:";
  const tld = hostname.split(".").pop() || "";
  const subdomainCount = Math.max(0, hostname.split(".").length - 2);
  const brandLabel = extractRegistrableLabel(hostname);

  if (ssrfBlocked) {
    signals.push({
      ruleId: "ssrf_private_host",
      category: "domain_url",
      severity: "critical",
      weight: 15,
      description: "URL aponta para endereço local ou IP privado (risco de SSRF / redirecionamento interno).",
      evidence: hostname,
      source: "url",
    });
  }

  if (hasCredentialsInUrl) {
    signals.push({
      ruleId: "url_embedded_credentials",
      category: "domain_url",
      severity: "high",
      weight: 12,
      description: "URL contém credenciais embutidas (técnica comum de phishing).",
      evidence: hostname,
      source: "url",
    });
  }

  if (isPunycode) {
    signals.push({
      ruleId: "punycode_homograph",
      category: "domain_url",
      severity: "high",
      weight: 10,
      description: "Domínio utiliza codificação Punycode (possível ataque homógrafo).",
      evidence: hostname,
      source: "url",
    });
  }

  if (!isHttps) {
    signals.push({
      ruleId: "non_https_url",
      category: "domain_url",
      severity: "low",
      weight: 4,
      description: "Página de candidatura sem HTTPS (sinal contextual de baixa segurança).",
      evidence: rawUrl.slice(0, 80),
      source: "url",
    });
  }

  if (SHORTENER_HOSTS.has(hostname)) {
    signals.push({
      ruleId: "url_shortener",
      category: "domain_url",
      severity: "medium",
      weight: 7,
      description: "Link de candidatura ocultado por encurtador de URL.",
      evidence: hostname,
      source: "url",
    });
  }

  if (EXTERNAL_FORM_HOSTS.has(hostname)) {
    signals.push({
      ruleId: "external_generic_form",
      category: "domain_url",
      severity: "medium",
      weight: 6,
      description: "Candidatura direcionada para formulário externo genérico sem domínio corporativo.",
      evidence: hostname,
      source: "url",
    });
  }

  if (SUSPICIOUS_TLDS.has(tld)) {
    signals.push({
      ruleId: "unusual_tld",
      category: "domain_url",
      severity: "medium",
      weight: 6,
      description: `Extensão de domínio incomum para recrutamento corporativo (.${tld}).`,
      evidence: hostname,
      source: "url",
    });
  }

  if (subdomainCount >= 3) {
    signals.push({
      ruleId: "excessive_subdomains",
      category: "domain_url",
      severity: "medium",
      weight: 6,
      description: "Uso excessivo de subdomínios, comum em páginas clonadas.",
      evidence: hostname,
      source: "url",
    });
  }

  // Typosquatting contra marcas conhecidas
  for (const known of KNOWN_TRUSTED_BRANDS) {
    if (brandLabel === known) break;
    if (brandLabel.length >= 4 && Math.abs(brandLabel.length - known.length) <= 2) {
      const dist = levenshteinDistance(brandLabel, known);
      if (dist >= 1 && dist <= 2) {
        signals.push({
          ruleId: "typosquatting_brand",
          category: "domain_url",
          severity: "high",
          weight: 13,
          description: `Domínio muito semelhante à marca "${known}" (possível typosquatting).`,
          evidence: hostname,
          source: "url",
        });
        break;
      }
    }
  }

  // Coerência básica entre nome da empresa e domínio quando não é portal/ATS conhecido
  const isKnownPortalOrAts = KNOWN_TRUSTED_BRANDS.some((b) => hostname.includes(b)) ||
    /arbeitnow|jobicy|himalayas|workingnomads|themuse|github|catho|vagas\.com|infojobs|programathor|geekhunter/.test(hostname);

  const companyMatchesDomain =
    isKnownPortalOrAts ||
    (companyNorm.length >= 3 && (brandLabel.includes(companyNorm.slice(0, 5)) || companyNorm.includes(brandLabel)));

  return {
    signals,
    domainInfo: {
      valid: true,
      hostname,
      isHttps,
      ssrfBlocked,
      isKnownPortalOrAts,
      companyMatchesDomain,
    },
  };
}
