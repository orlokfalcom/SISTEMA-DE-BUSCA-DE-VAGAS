/**
 * Validação estrita de URLs, proteção contra SSRF (IPs privados/locais),
 * detecção de homógrafos/punycode e distância de edição para typosquatting.
 */

const PRIVATE_IPV4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function isPrivateOrLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true;
  }
  if (PRIVATE_IPV4_PATTERNS.some((re) => re.test(host))) return true;
  // IP numérico decimal/octal ofuscado
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  return false;
}

export function parseSafeUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input || input.length > 2048) {
    return { valid: false, reason: "empty_or_too_long", parsed: null };
  }
  if (/^(javascript|data|vbscript|file|gopher):/i.test(input)) {
    return { valid: false, reason: "dangerous_scheme", parsed: null };
  }
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, reason: "unsupported_protocol", parsed: null };
    }
    const ssrfBlocked = isPrivateOrLocalHost(parsed.hostname);
    return {
      valid: true,
      ssrfBlocked,
      parsed,
      protocol: parsed.protocol,
      hostname: parsed.hostname.toLowerCase(),
      pathname: parsed.pathname || "/",
      hasCredentialsInUrl: Boolean(parsed.username || parsed.password),
      isPunycode: parsed.hostname.toLowerCase().includes("xn--"),
    };
  } catch {
    return { valid: false, reason: "malformed_url", parsed: null };
  }
}

export function levenshteinDistance(a, b) {
  const s1 = String(a || "");
  const s2 = String(b || "");
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const prev = new Array(s2.length + 1);
  const curr = new Array(s2.length + 1);
  for (let j = 0; j <= s2.length; j++) prev[j] = j;

  for (let i = 1; i <= s1.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= s2.length; j++) prev[j] = curr[j];
  }
  return prev[s2.length];
}
