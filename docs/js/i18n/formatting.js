/**
 * Formatação regional nativa usando Intl APIs (números, moedas, datas, tempo relativo, ordenação e plural).
 */

function toLocale(code) {
  return code === "pt" ? "pt-BR" : code || "pt-BR";
}

export function formatNumber(value, code = "pt", options = {}) {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value ?? "");
  try {
    return new Intl.NumberFormat(toLocale(code), options).format(num);
  } catch {
    return String(num);
  }
}

export function formatPercent(value, code = "pt", alreadyPct = true) {
  const num = Number(value);
  if (Number.isNaN(num)) return "0%";
  const ratio = alreadyPct ? num / 100 : num;
  try {
    return new Intl.NumberFormat(toLocale(code), { style: "percent", maximumFractionDigits: 0 }).format(ratio);
  } catch {
    return `${Math.round(ratio * 100)}%`;
  }
}

export function formatDate(dateInput, code = "pt", options = { dateStyle: "medium" }) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput || "");
  try {
    return new Intl.DateTimeFormat(toLocale(code), options).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatRelativeDays(daysDiff, code = "pt") {
  const n = Math.round(Number(daysDiff) || 0);
  try {
    return new Intl.RelativeTimeFormat(toLocale(code), { numeric: "auto" }).format(n, "day");
  } catch {
    return `${n}d`;
  }
}

export function compareLocalized(a, b, code = "pt") {
  try {
    return new Intl.Collator(toLocale(code), { sensitivity: "base" }).compare(String(a || ""), String(b || ""));
  } catch {
    return String(a || "").localeCompare(String(b || ""));
  }
}

export function selectPlural(count, forms, code = "pt") {
  try {
    const cat = new Intl.PluralRules(toLocale(code)).select(Number(count) || 0);
    return forms[cat] || forms.other || forms.one || "";
  } catch {
    return count === 1 ? forms.one || forms.other || "" : forms.other || "";
  }
}
