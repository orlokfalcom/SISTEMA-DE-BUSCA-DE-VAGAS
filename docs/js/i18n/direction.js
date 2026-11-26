import { RTL_LANGS, SUPPORTED_LANGUAGES } from "./languages.js";

export function isRtlLanguage(code) {
  return RTL_LANGS.has(String(code || "").trim());
}

export function applyDocumentDirection(code) {
  if (typeof document === "undefined") return;
  const htmlLang = code === "pt" ? "pt-BR" : code;
  const dir = isRtlLanguage(code) ? "rtl" : "ltr";
  document.documentElement.lang = htmlLang;
  document.documentElement.dir = dir;

  // Atualiza hreflang dinâmico para acessibilidade/SEO
  let alt = document.querySelector('link[rel="alternate"][data-dynamic-hreflang="true"]');
  if (!alt && document.head) {
    alt = document.createElement("link");
    alt.rel = "alternate";
    alt.setAttribute("data-dynamic-hreflang", "true");
    document.head.appendChild(alt);
  }
  if (alt && typeof window !== "undefined") {
    alt.hreflang = htmlLang;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    alt.href = url.toString();
  }
}

export function getLanguageMeta(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) || SUPPORTED_LANGUAGES[0];
}
