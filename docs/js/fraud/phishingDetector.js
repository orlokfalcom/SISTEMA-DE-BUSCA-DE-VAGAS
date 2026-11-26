/**
 * CAMADA 7 — Detecção de Phishing e Coleta Indevida de Dados Pessoais
 * Diferencia menções legítimas pós-contratação de coleta precoce/phishing.
 */

import { normalizeText } from "./utils/normalization.js";

const PHISHING_RULES = [
  {
    id: "sensitive_docs_pre_hire",
    weight: 18,
    severity: "critical",
    regex: /\b(enviar\s+(?:foto\s+do\s+)?(?:cpf|rg|cnh|documento)|selfie\s+com\s+documento|send\s+(?:ssn|passport|driver'?s?\s+license|id\s+photo)|envoyer\s+(?:passeport|piece\s+d[' ]?identite)|enviar\s+(?:dni|ine|pasaporte))\b/i,
    description: "Solicitação precoce de documentos pessoais sensíveis ou selfie com documento antes da contratação.",
  },
  {
    id: "banking_or_card_data",
    weight: 20,
    severity: "critical",
    regex: /\b(dados\s+bancarios\s+para\s+(?:cadastro|selecao)|numero\s+do\s+cartao|codigo\s+cvv|bank\s+account\s+details\s+to\s+apply|credit\s+card\s+number|coordenadas\s+bancarias\s+para\s+postular)\b/i,
    description: "Solicitação de dados bancários ou de cartão durante a candidatura (forte indício de phishing).",
  },
  {
    id: "credentials_or_2fa",
    weight: 20,
    severity: "critical",
    regex: /\b(informe\s+sua\s+senha|codigo\s+de\s+verificacao|codigo\s+2fa|enter\s+your\s+password|verification\s+code|otp\s+code)\b/i,
    description: "Solicitação de senhas ou códigos de autenticação (2FA/OTP).",
  },
];

const LEGIT_ADMISSION_CONTEXT = /\b(apos\s+aprovacao|na\s+etapa\s+de\s+admissao|upon\s+offer|after\s+hiring|onboarding\s+documentation)\b/i;

export function detectPhishingAndDataCollection(job) {
  const title = String(job.title || "");
  const desc = String(job.description || "");
  const combined = `${title}\n${desc}`;
  const norm = normalizeText(combined);
  const signals = [];

  const isPostHireContext = LEGIT_ADMISSION_CONTEXT.test(norm);

  for (const rule of PHISHING_RULES) {
    const match = combined.match(rule.regex) || norm.match(rule.regex);
    if (!match) continue;
    // Se mencionado apenas no contexto explícito de admissão após aprovação, reduz severidade
    const weight = isPostHireContext && rule.id === "sensitive_docs_pre_hire" ? 6 : rule.weight;
    const severity = isPostHireContext && rule.id === "sensitive_docs_pre_hire" ? "low" : rule.severity;
    signals.push({
      ruleId: rule.id,
      category: "phishing_data",
      severity,
      weight,
      description: rule.description,
      evidence: match[0].slice(0, 120),
      source: "description",
    });
  }

  return { signals };
}
