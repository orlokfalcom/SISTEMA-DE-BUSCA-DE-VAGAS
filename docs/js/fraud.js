/**
 * VagaPulse AI — Detector & Filtro de Vagas Falsas, Golpes e Ghost Jobs
 * Analisa sinais lexicais (PT/EN/ES/FR), domínios suspeitos, promessas irreais,
 * cobrança de taxas e frescor da vaga para atribuir risco de fraude (0–100).
 */

import { normalizeText } from "./nlp.js";

const FRAUD_PATTERNS = [
  {
    weight: 55,
    regex: /\b(taxa\s+de\s+(?:inscricao|cadastro|adesao)|pagamento\s+antecipado|deposito\s+previo|pix\s+para|curso\s+pago\s+obrigatorio|registration\s+fee|upfront\s+fee|pay\s+to\s+apply|buy\s+(?:starter\s+)?kit)\b/i,
    signal: "Solicitação de pagamento, taxa ou compra prévia (forte indício de golpe)",
  },
  {
    weight: 45,
    regex: /\b(ganhe\s+(?:r\$|\$)?\s*\d{3,}\s*(?:por\s+dia|ao\s+dia|por\s+hora)|renda\s+extra\s+garantida|dinheiro\s+facil|sem\s+experiencia\s+ganhe|make\s+\$?\d{3,}\s*(?:a|per)\s*day|guaranteed\s+income|easy\s+money)\b/i,
    signal: "Promessa financeira irreal ou ganho garantido sem requisitos",
  },
  {
    weight: 40,
    regex: /\b(avaliar\s+produtos|curtir\s+videos|marketing\s+multinivel|piramide|task\s+scam|send\s+(?:ssn|cpf|rg|bank\s+account)|dados\s+bancarios\s+para\s+cadastro)\b/i,
    signal: "Padrão de esquema de tarefas falsas ou coleta indevida de documentos/dados bancários",
  },
  {
    weight: 30,
    regex: /(chamar\s+no\s+telegram|apenas\s+whatsapp|whatsapp\s+only|t\.me\/|bit\.ly\/|tinyurl\.com\/)/i,
    signal: "Canal de recrutamento informal ou link encurtado suspeito",
  },
  {
    weight: 22,
    regex: /(!{3,}|\$\$\$|💰{2,}|\burgente\b.*\bvaga\b.*\bhoje\b)/i,
    signal: "Linguagem sensacionalista/clickbait típica de spam",
  },
];

const GENERIC_COMPANY_NAMES = new Set([
  "", "empresa", "confidencial", "nao informado", "não informado", "n/a", "unknown", "company", "anonymous",
]);

export function evaluateJobAuthenticity(job) {
  const title = String(job?.title || "");
  const company = String(job?.company || "");
  const desc = String(job?.description || "");
  const url = String(job?.url || "");
  const combined = `${title}\n${company}\n${desc}\n${url}`;
  const normCombined = normalizeText(combined);

  let riskScore = 0;
  const signals = [];

  for (const rule of FRAUD_PATTERNS) {
    if (rule.regex.test(normCombined) || rule.regex.test(combined)) {
      riskScore += rule.weight;
      signals.push(rule.signal);
    }
  }

  // Empresa genérica + falta de descrição substantiva
  if (GENERIC_COMPANY_NAMES.has(normalizeText(company))) {
    riskScore += 18;
    signals.push("Nome da empresa ausente ou genérico");
  }

  if (desc.trim().length < 40) {
    riskScore += 20;
    signals.push("Descrição muito curta ou sem requisitos claros");
  }

  if (!/^https?:\/\//i.test(url) && !url.startsWith("#")) {
    riskScore += 15;
    signals.push("URL da vaga ausente ou inválida");
  }

  // Ghost job: vaga publicada há mais de 90 dias
  if (/^\d{4}-\d{2}-\d{2}/.test(String(job?.posted_at || ""))) {
    const postedMs = Date.parse(String(job.posted_at).slice(0, 10));
    if (!Number.isNaN(postedMs)) {
      const ageDays = (Date.now() - postedMs) / (1000 * 60 * 60 * 24);
      if (ageDays > 90) {
        riskScore += 16;
        signals.push(`Publicada há ~${Math.round(ageDays)} dias (possível ghost job)`);
      }
    }
  }

  riskScore = Math.min(100, riskScore);
  let status = "Verificada";
  if (riskScore >= 60) status = "Provável Golpe/Falsa";
  else if (riskScore >= 30) status = "Suspeita";

  return {
    riskScore,
    status,
    isFake: riskScore >= 60,
    isSuspicious: riskScore >= 30,
    signals,
  };
}
