/**
 * VagaPulse AI — Facade Central de Internacionalização (i18n) para 50 Idiomas
 */

export { SUPPORTED_LANGUAGES, RTL_LANGS, SUPPORTED_CODE_SET } from "./i18n/languages.js";
export { applyDocumentDirection, isRtlLanguage, getLanguageMeta } from "./i18n/direction.js";
export { detectPreferredLanguage, normalizeLanguageTag } from "./i18n/detection.js";
export {
  formatNumber,
  formatPercent,
  formatDate,
  formatRelativeDays,
  compareLocalized,
  selectPlural,
} from "./i18n/formatting.js";
export {
  NAMESPACES,
  getUiLang,
  onLanguageChange,
  loadLanguagePack,
  t,
  applyDomTranslations,
  setLanguage,
} from "./i18n/config.js";

import { setLanguage, applyDomTranslations } from "./i18n/config.js";
import { ensureStructuredLabelsTranslated } from "./translator.js";

export function applyUiTranslations(lang = "pt") {
  return applyDomTranslations(lang);
}

export async function applyUiTranslationsAsync(lang = "pt") {
  const code = await setLanguage(lang);
  ensureStructuredLabelsTranslated(code).catch(() => {});
  return code;
}
