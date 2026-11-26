/**
 * Motor Central de Internacionalização (i18n) — Namespaces JSON, Cache, Interpolação, Pluralização e Fallback PT.
 */

import { SUPPORTED_CODE_SET } from "./languages.js";
import { applyDocumentDirection } from "./direction.js";
import { selectPlural } from "./formatting.js";
import { idbGet, idbSet } from "../storage.js";

export const NAMESPACES = ["common", "dashboard", "forms", "errors", "notifications"];
const NATIVE_TRUSTED_HTML_LANGS = new Set(["pt", "en", "fr", "es", "ja"]);

const loadedPacks = new Map(); // code -> merged flat dict
let currentLang = "pt";
const subscribers = new Set();

export function getUiLang() {
  return currentLang;
}

export function onLanguageChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

async function fetchJsonLocale(code, ns) {
  const url = new URL(`./locales/${code}/${ns}.json`, import.meta.url);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

export async function loadLanguagePack(code) {
  const safeCode = SUPPORTED_CODE_SET.has(code) ? code : "pt";
  if (loadedPacks.has(safeCode)) return loadedPacks.get(safeCode);

  // Tenta cache em IndexedDB primeiro para resposta instantânea
  const cacheKey = `i18n_ns_pack_${safeCode}`;
  const cached = await idbGet(cacheKey, null);
  if (cached && typeof cached === "object" && Object.keys(cached).length > 50) {
    loadedPacks.set(safeCode, cached);
    return cached;
  }

  const merged = {};
  const results = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        return await fetchJsonLocale(safeCode, ns);
      } catch {
        return null;
      }
    })
  );

  for (const part of results) {
    if (part && typeof part === "object") {
      Object.assign(merged, part);
    }
  }

  if (Object.keys(merged).length > 0) {
    loadedPacks.set(safeCode, merged);
    idbSet(cacheKey, merged);
  }
  return merged;
}

export function t(key, vars = {}) {
  const pack = loadedPacks.get(currentLang) || loadedPacks.get("pt") || {};
  const fallbackPack = loadedPacks.get("pt") || {};
  let template = pack[key] !== undefined ? pack[key] : fallbackPack[key] !== undefined ? fallbackPack[key] : key;

  if (vars && typeof vars === "object" && vars.pluralForms && vars.count !== undefined) {
    template = selectPlural(vars.count, vars.pluralForms, currentLang);
  }

  if (typeof template !== "string") return String(template ?? key);
  for (const [k, v] of Object.entries(vars || {})) {
    if (k === "pluralForms") continue;
    template = template.replaceAll(`{${k}}`, String(v));
  }
  return template;
}

export function applyDomTranslations(code = currentLang) {
  if (typeof document === "undefined") return code;
  applyDocumentDirection(code);

  const title = t("pageTitle");
  if (title && title !== "pageTitle") document.title = title;

  const allowTrustedHtml = NATIVE_TRUSTED_HTML_LANGS.has(code);
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (!key) continue;
    const val = t(key);
    if (val === key) continue;
    if (key === "heroTitle" && allowTrustedHtml) el.innerHTML = val;
    else el.textContent = val;
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) continue;
    const val = t(key);
    if (val !== key) el.setAttribute("placeholder", val);
  }
  return code;
}

export async function setLanguage(code = "pt") {
  const target = SUPPORTED_CODE_SET.has(code) ? code : "pt";
  // Garante sempre o fallback PT carregado
  if (!loadedPacks.has("pt")) {
    await loadLanguagePack("pt");
  }
  if (target !== "pt") {
    await loadLanguagePack(target);
  }
  currentLang = target;
  applyDomTranslations(target);
  for (const fn of subscribers) {
    try {
      fn(target);
    } catch {
      // ignore subscriber errors
    }
  }
  return target;
}
