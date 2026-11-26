/**
 * Conectores Opcionais de Threat Intelligence (URLhaus / Google Safe Browsing / VirusTotal / RDAP)
 * Com cache TTL em memória, timeout estrito e sem declarar URL segura apenas por ausência de registros.
 */

const TI_CACHE_TTL_MS = 10 * 60 * 1000;
const tiCache = new Map();

export async function checkThreatIntelligence(domainInfo, connectors = null) {
  if (!domainInfo?.valid || domainInfo.ssrfBlocked || !domainInfo.hostname) {
    return { checked: false, status: "unchecked", signals: [] };
  }
  if (!connectors || typeof connectors.lookupDomain !== "function") {
    return { checked: false, status: "not_configured", signals: [] };
  }

  const host = domainInfo.hostname;
  const cached = tiCache.get(host);
  if (cached && Date.now() - cached.ts < TI_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
    const res = await connectors.lookupDomain(host, ctrl ? ctrl.signal : undefined);
    if (timer) clearTimeout(timer);

    const signals = [];
    if (res && res.malicious === true) {
      signals.push({
        ruleId: "threat_intel_malicious_domain",
        category: "domain_url",
        severity: "critical",
        weight: 15,
        description: `Domínio listado em fonte de Threat Intelligence (${res.provider || "externa"}).`,
        evidence: host,
        source: "threat_intel",
      });
    }
    const out = {
      checked: true,
      // Nunca declara seguro apenas por ausência de registro negativo
      status: res?.malicious ? "malicious_listed" : "no_negative_records",
      signals,
    };
    tiCache.set(host, { ts: Date.now(), data: out });
    return out;
  } catch {
    return { checked: false, status: "lookup_failed", signals: [] };
  }
}
