/**
 * CAMADA 6 — Análise Contextual de Remuneração e Coerência Profissional
 * Considera moeda, período (hora/dia/mês/ano) e senioridade; nunca usa teto fixo universal.
 */

import { normalizeText } from "./utils/normalization.js";

function parseSalaryContext(salaryRaw, descRaw) {
  const text = `${salaryRaw || ""} ${descRaw || ""}`;
  const m = text.match(/(R\$|BRL|USD|US\$|\$|EUR|€|GBP|£|JPY|¥)\s*([\d.,]+)(?:\s*(?:k|mil))?/i);
  if (!m) return null;

  const currencyToken = m[1].toUpperCase();
  const currency =
    currencyToken === "R$" || currencyToken === "BRL"
      ? "BRL"
      : currencyToken === "EUR" || currencyToken === "€"
        ? "EUR"
        : currencyToken === "GBP" || currencyToken === "£"
          ? "GBP"
          : currencyToken === "JPY" || currencyToken === "¥"
            ? "JPY"
            : "USD";

  let num = parseFloat(m[2].replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(num) || num <= 0) return null;
  if (/\b(?:k|mil)\b/i.test(m[0])) num *= 1000;

  const norm = normalizeText(text);
  const period = /\b(por\s+dia|ao\s+dia|per\s+day|\/dia|\/day|daily)\b/.test(norm)
    ? "day"
    : /\b(por\s+hora|\/hora|per\s+hour|\/hr|hourly)\b/.test(norm)
      ? "hour"
      : /\b(anual|ano|year|annual|\/yr|p\.a\.)\b/.test(norm)
        ? "year"
        : "month";

  // Converte para equivalente mensal aproximado na mesma moeda para checagem contextual
  const monthlyEq =
    period === "day" ? num * 22 : period === "hour" ? num * 160 : period === "year" ? num / 12 : num;

  return { currency, amount: num, period, monthlyEq };
}

export function analyzeSalaryCoherence(job) {
  const signals = [];
  const parsed = parseSalaryContext(job.salary, job.description);
  if (!parsed) return { signals, salaryContext: null };

  const norm = normalizeText(`${job.title || ""} ${job.seniority || ""} ${job.description || ""}`);
  const isEntryOrIntern = /\b(estagio|estagiario|intern|internship|trainee|aprendiz|sem\s+experiencia|no\s+experience|junior|becario|stagiaire)\b/.test(norm);

  // Limiares contextuais por moeda e senioridade (apenas outliers extremos)
  const entryOutlierMonthly = {
    BRL: 15000,
    USD: 14000,
    EUR: 12000,
    GBP: 11000,
    JPY: 1500000,
  };

  if (isEntryOrIntern && parsed.monthlyEq >= (entryOutlierMonthly[parsed.currency] || 15000)) {
    signals.push({
      ruleId: "unrealistic_entry_salary",
      category: "financial_promises",
      severity: "medium",
      weight: 7,
      description: `Remuneração (${parsed.currency} ~${Math.round(parsed.monthlyEq)}/mês) incompatível com vaga inicial/sem experiência.`,
      evidence: `${job.salary || parsed.amount} (${parsed.period})`,
      source: "salary",
    });
  }

  return { signals, salaryContext: parsed };
}
