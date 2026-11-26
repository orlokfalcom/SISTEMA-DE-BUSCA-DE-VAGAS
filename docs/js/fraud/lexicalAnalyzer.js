/**
 * CAMADA 1 — Análise Linguística e Semântica (PT, EN, ES, FR)
 * Diferencia contexto legítimo (ex.: "sem taxa", "benefícios CLT") de fraude real.
 */

import { normalizeText } from "./utils/normalization.js";

const LEXICAL_RULES = [
  {
    id: "payment_fee",
    category: "payment_request",
    severity: "critical",
    weight: 25,
    regex: /\b(taxa\s+de\s+(?:inscricao|cadastro|adesao|treinamento)|pagamento\s+antecipado|deposito\s+previo|pix\s+para|curso\s+pago\s+obrigatorio|registration\s+fee|upfront\s+fee|pay\s+to\s+apply|training\s+fee|frais\s+d[' ]?inscription|paiement\s+prealable|cuota\s+de\s+inscripcion|pago\s+anticipado)\b/i,
    negationGuard: /\b(sem\s+taxa|gratuito|no\s+fee|never\s+pay|aucun\s+frais|sin\s+costo|gratis)\b/i,
    description: "A vaga menciona cobrança de taxa, depósito ou curso pago para participar do processo.",
  },
  {
    id: "equipment_kit",
    category: "payment_request",
    severity: "critical",
    weight: 24,
    regex: /\b(compra\s+de\s+kit|adquirir\s+equipamento|buy\s+(?:starter\s+)?kit|purchase\s+equipment\s+before|acheter\s+le\s+kit|comprar\s+equipo\s+inicial)\b/i,
    negationGuard: /\b(fornecemos\s+equipamento|company\s+provides\s+laptop|equipamento\s+fornecido)\b/i,
    description: "Exigência de compra antecipada de kit ou equipamento pelo candidato.",
  },
  {
    id: "easy_money_promise",
    category: "financial_promises",
    severity: "high",
    weight: 10,
    regex: /\b(ganhe\s+(?:r\$|\$)?\s*\d{3,}\s*(?:por\s+dia|ao\s+dia|por\s+hora)|renda\s+extra\s+garantida|dinheiro\s+facil|sem\s+experiencia\s+ganhe|make\s+\$?\d{3,}\s*(?:a|per)\s*day|guaranteed\s+income|easy\s+money|gagner\s+\d{3,}\s*euros?\s*par\s*jour|argent\s+facile|gana\s+\$?\d{3,}\s*al\s*dia|dinero\s+facil)\b/i,
    description: "Promessa financeira irreal ou ganho garantido incompatível com recrutamento profissional.",
  },
  {
    id: "task_pyramid_scam",
    category: "fraudulent_behavior",
    severity: "high",
    weight: 10,
    regex: /\b(avaliar\s+produtos|curtir\s+videos|marketing\s+multinivel|esquema\s+de\s+piramide|task\s+scam|like\s+videos\s+for\s+money|mlm\s+opportunity|evaluer\s+des\s+produits|liker\s+des\s+videos|calificar\s+productos)\b/i,
    description: "Padrão típico de golpe de tarefas remuneradas ou marketing multinível disfarçado.",
  },
  {
    id: "guaranteed_hire_urgency",
    category: "ad_quality",
    severity: "medium",
    weight: 5,
    regex: /\b(contratacao\s+imediata\s+sem\s+entrevista|vaga\s+garantida|ultimas\s+vagas\s+hoje|guaranteed\s+hire|no\s+interview\s+needed|embauche\s+garantie|contratacion\s+garantizada\s+sin\s+entrevista)\b/i,
    description: "Pressão psicológica ou garantia de contratação sem avaliação técnica.",
  },
  {
    id: "informal_channel_only",
    category: "fraudulent_behavior",
    severity: "medium",
    weight: 8,
    regex: /\b(chamar\s+no\s+telegram|no\s+telegram|apenas\s+whatsapp|somente\s+telegram|whatsapp\s+only|contact\s+via\s+telegram(?:\s+only)?|uniquement\s+par\s+telegram|solo\s+por\s+whatsapp)\b/i,
    description: "Recrutamento direcionado exclusivamente para canais informais fora de plataformas oficiais.",
  },
];

export function analyzeLexicalAndSemantic(job) {
  const title = String(job.title || "");
  const desc = String(job.description || "");
  const combined = `${title}\n${desc}`;
  const norm = normalizeText(combined);
  const signals = [];

  for (const rule of LEXICAL_RULES) {
    const match = combined.match(rule.regex) || norm.match(rule.regex);
    if (!match) continue;
    if (rule.negationGuard && (rule.negationGuard.test(norm) || rule.negationGuard.test(combined))) {
      continue;
    }
    signals.push({
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      weight: rule.weight,
      description: rule.description,
      evidence: match[0].slice(0, 120),
      source: title.toLowerCase().includes(match[0].toLowerCase()) ? "title" : "description",
    });
  }

  // Falta de requisitos técnicos/atividades reais em anúncios genéricos
  const wordCount = norm.split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && wordCount < 12) {
    signals.push({
      ruleId: "insufficient_description",
      category: "ad_quality",
      severity: "low",
      weight: 4,
      description: "Descrição excessivamente curta, sem detalhamento claro de responsabilidades ou requisitos.",
      evidence: `${wordCount} palavra(s) na descrição`,
      source: "description",
    });
  }

  return { signals, wordCount };
}
