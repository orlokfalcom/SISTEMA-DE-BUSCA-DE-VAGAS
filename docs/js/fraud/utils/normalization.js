/**
 * Normalização segura, proteção contra ReDoS (limitação de tamanho),
 * sanitização contra prompt injection e hashing (FNV-1a + SimHash 64-bit).
 */

export const MAX_TEXT_LEN = 12000;

export function safeSliceText(value, maxLen = MAX_TEXT_LEN) {
  const str = String(value ?? "");
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export function normalizeText(text) {
  return safeSliceText(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeForSimilarity(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

/**
 * Neutraliza tentativas de prompt injection antes de enviar texto não confiável para modelos de IA.
 */
export function sanitizeUntrustedText(text, maxLen = 4000) {
  const cleaned = safeSliceText(text, maxLen)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b(ignore\s+(?:all\s+)?previous\s+instructions|system\s*:|assistant\s*:|<\|im_start\|>|<\|im_end\|>)\b/gi, "[FILTERED]");
  return cleaned.trim();
}

export function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  const input = safeSliceText(str, MAX_TEXT_LEN);
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * SimHash de 32 bits leve para detecção rápida de campanhas/descrições quase idênticas.
 */
export function computeSimHash(text) {
  const tokens = tokenizeForSimilarity(text);
  if (!tokens.length) return 0;
  const bits = new Int32Array(32);
  for (const tok of tokens) {
    let h = 0x811c9dc5;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    for (let b = 0; b < 32; b++) {
      bits[b] += (h & (1 << b)) !== 0 ? 1 : -1;
    }
  }
  let sim = 0;
  for (let b = 0; b < 32; b++) {
    if (bits[b] > 0) sim |= 1 << b;
  }
  return sim >>> 0;
}

export function simHashSimilarity(a, b) {
  let xor = (a ^ b) >>> 0;
  let dist = 0;
  while (xor) {
    dist += xor & 1;
    xor >>>= 1;
  }
  return 1 - dist / 32;
}
