import { SUPPORTED_CODE_SET } from "./languages.js";

/**
 * Normaliza código de idioma preservando variantes zh-CN e zh-TW sem confundi-las.
 */
export function normalizeLanguageTag(rawTag) {
  const tag = String(rawTag || "").trim();
  if (!tag) return null;
  if (SUPPORTED_CODE_SET.has(tag)) return tag;

  const lower = tag.toLowerCase().replaceAll("_", "-");
  if (lower === "zh-cn" || lower.includes("hans") || lower.endsWith("-cn") || lower.endsWith("-sg")) return "zh-CN";
  if (lower === "zh-tw" || lower.includes("hant") || lower.endsWith("-tw") || lower.endsWith("-hk") || lower.endsWith("-mo")) return "zh-TW";
  if (lower === "zh") return "zh-CN";

  const base = lower.split("-")[0];
  if (SUPPORTED_CODE_SET.has(base)) return base;
  return null;
}

/**
 * Prioridade oficial de detecção:
 * 1. Conta do usuário (accountLang)
 * 2. Salvo localmente (savedLang)
 * 3. Parâmetro na URL (?lang=...)
 * 4. Preferência do navegador (navigator.languages)
 * 5. Português ("pt") como fallback
 */
export function detectPreferredLanguage({
  accountLang = null,
  savedLang = null,
  urlSearch = typeof window !== "undefined" ? window.location.search : "",
  navigatorLanguages = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [],
} = {}) {
  const fromAccount = normalizeLanguageTag(accountLang);
  if (fromAccount) return fromAccount;

  const fromSaved = normalizeLanguageTag(savedLang);
  if (fromSaved) return fromSaved;

  if (urlSearch) {
    try {
      const params = new URLSearchParams(urlSearch);
      const fromUrl = normalizeLanguageTag(params.get("lang"));
      if (fromUrl) return fromUrl;
    } catch {
      // ignore malformed query string
    }
  }

  for (const navLang of navigatorLanguages || []) {
    const matched = normalizeLanguageTag(navLang);
    if (matched) return matched;
  }

  return "pt";
}
