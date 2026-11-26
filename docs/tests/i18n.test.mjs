import {
  SUPPORTED_LANGUAGES,
  RTL_LANGS,
  NAMESPACES,
  loadLanguagePack,
  setLanguage,
  t,
  detectPreferredLanguage,
  isRtlLanguage,
  formatNumber,
  formatPercent,
  formatDate,
  formatRelativeDays,
  selectPlural,
} from '../js/i18n.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

export async function runI18n50TestSuite() {
  assert(SUPPORTED_LANGUAGES.length === 50, `Esperado exatamente 50 idiomas, obtido ${SUPPORTED_LANGUAGES.length}`);

  const ptPack = await loadLanguagePack('pt');
  const requiredKeys = Object.keys(ptPack);
  assert(requiredKeys.length >= 100, `Esperado >= 100 chaves obrigatórias, obtido ${requiredKeys.length}`);

  const packs = await Promise.all(SUPPORTED_LANGUAGES.map(async ({ code }) => [code, await loadLanguagePack(code)]));
  const coverageReport = {};
  for (const [code, pack] of packs) {
    const missing = requiredKeys.filter((k) => pack[k] === undefined || String(pack[k]).trim() === '');
    assert(missing.length === 0, `Idioma ${code} possui ${missing.length} chaves ausentes/vazias: ${missing.slice(0, 5).join(', ')}`);
    coverageReport[code] = '100%';
  }

  // Testa RTL vs LTR
  for (const rtlCode of RTL_LANGS) {
    await setLanguage(rtlCode);
    assert(isRtlLanguage(rtlCode) === true, `${rtlCode} deve ser RTL`);
    assert(document.documentElement.dir === 'rtl', `document.dir deve ser rtl para ${rtlCode}`);
  }
  await setLanguage('ja');
  assert(document.documentElement.dir === 'ltr', 'document.dir deve ser ltr para ja');
  assert(document.documentElement.lang === 'ja', 'document.lang deve ser ja');

  // Interpolação de variáveis e pluralização
  await setLanguage('pt');
  assert(t('guardAlerts', { n: 3 }).includes('3'), 'Interpolação falhou para guardAlerts');
  assert(t('notifSkillAdded', { skill: 'Rust' }).includes('Rust'), 'Interpolação falhou para notifSkillAdded');
  const pluralPt = selectPlural(2, { one: '1 vaga', other: '{n} vagas' }, 'pt');
  assert(pluralPt === '{n} vagas', 'Pluralização falhou');

  // Detecção automática + distinção zh-CN vs zh-TW
  assert(detectPreferredLanguage({ accountLang: 'fr', savedLang: 'en' }) === 'fr', 'Prioridade 1: conta');
  assert(detectPreferredLanguage({ savedLang: 'ja', urlSearch: '?lang=es' }) === 'ja', 'Prioridade 2: local');
  assert(detectPreferredLanguage({ urlSearch: '?lang=zh-TW', navigatorLanguages: ['zh-CN'] }) === 'zh-TW', 'Prioridade 3: URL zh-TW');
  assert(detectPreferredLanguage({ navigatorLanguages: ['zh-Hant-TW'] }) === 'zh-TW', 'Browser zh-TW');
  assert(detectPreferredLanguage({ navigatorLanguages: ['zh-Hans-CN'] }) === 'zh-CN', 'Browser zh-CN');
  assert(detectPreferredLanguage({ navigatorLanguages: ['xx-UNKNOWN'] }) === 'pt', 'Fallback final PT');

  // Formatação regional Intl
  assert(formatNumber(12345.6, 'de').length >= 6, 'Intl.NumberFormat DE');
  assert(formatPercent(85, 'pt', true).includes('85'), 'Intl.NumberFormat percent');
  assert(formatDate('2026-11-26', 'ja').length >= 4, 'Intl.DateTimeFormat JA');
  assert(formatRelativeDays(-1, 'en').length >= 3, 'Intl.RelativeTimeFormat EN');

  return {
    totalLanguages: SUPPORTED_LANGUAGES.length,
    namespaces: NAMESPACES.length,
    keysPerLanguage: requiredKeys.length,
    rtlLanguagesChecked: [...RTL_LANGS],
    all100Percent: Object.values(coverageReport).every((v) => v === '100%'),
  };
}
