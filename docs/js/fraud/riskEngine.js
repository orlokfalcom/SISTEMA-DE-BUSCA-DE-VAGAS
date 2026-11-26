/**
 * Motor Ponderado de Pontuação de Risco (0–100), Controle de Confiança das Evidências
 * e Geração de Recomendações Acionáveis.
 */

export const CATEGORY_CAPS = {
  payment_request: 25,
  phishing_data: 20,
  domain_url: 15,
  company_inconsistency: 15,
  financial_promises: 10,
  fraudulent_behavior: 10,
  ad_quality: 5,
};

export function computeRiskAndConfidence({ job, signals = [], domainInfo, companyInfo, ghostJob }) {
  // Deduplicação por ruleId + limite máximo (cap) por categoria
  const seenRuleIds = new Set();
  const dedupedSignals = [];
  const categorySums = {};
  for (const cat of Object.keys(CATEGORY_CAPS)) categorySums[cat] = 0;

  for (const sig of signals) {
    if (!sig || !sig.ruleId) continue;
    if (seenRuleIds.has(sig.ruleId)) continue;
    seenRuleIds.add(sig.ruleId);

    const cat = CATEGORY_CAPS[sig.category] !== undefined ? sig.category : "ad_quality";
    const cap = CATEGORY_CAPS[cat];
    const remaining = Math.max(0, cap - categorySums[cat]);
    const effectiveWeight = Math.min(Number(sig.weight) || 0, remaining);
    categorySums[cat] += effectiveWeight;

    dedupedSignals.push({
      category: sig.category,
      severity: sig.severity || "medium",
      description: sig.description,
      evidence: sig.evidence || "",
      source: sig.source || "unknown",
      weight: effectiveWeight,
    });
  }

  let riskScore = Object.values(categorySums).reduce((a, b) => a + b, 0);

  // Correlação e piso para categorias críticas (pagamento antecipado, phishing, pirâmide/tarefas)
  const hasPayment = categorySums.payment_request > 0;
  const hasPhishing = categorySums.phishing_data >= 18;
  const hasPhishingOrBehavior = categorySums.phishing_data > 0 || categorySums.fraudulent_behavior >= 8;
  if (hasPayment && hasPhishingOrBehavior) {
    riskScore = Math.min(100, riskScore + 18);
  }
  if (hasPayment && (categorySums.domain_url >= 6 || categorySums.company_inconsistency >= 8)) {
    riskScore = Math.min(100, riskScore + 14);
  }
  if (categorySums.payment_request >= 24) {
    riskScore = Math.max(riskScore, 65);
  }
  if (hasPhishing) {
    riskScore = Math.max(riskScore, 64);
    if (categorySums.domain_url >= 6 || categorySums.company_inconsistency >= 8) {
      riskScore = Math.max(riskScore, 80);
    }
  }
  if (categorySums.financial_promises >= 10 && categorySums.fraudulent_behavior >= 10) {
    riskScore = Math.max(riskScore, 68);
  }
  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  // Cálculo de Confiança = qualidade e suficiência das evidências disponíveis (não probabilidade)
  let dataCompleteness = 0;
  if (String(job.title || "").trim().length >= 4) dataCompleteness += 20;
  if (String(job.description || "").trim().length >= 80) dataCompleteness += 25;
  if (String(job.company || "").trim().length >= 2) dataCompleteness += 15;
  if (domainInfo?.valid) dataCompleteness += 20;
  if (String(job.posted_at || "").trim()) dataCompleteness += 10;
  if (String(job.salary || "").trim()) dataCompleteness += 10;

  const signalRichness = Math.min(30, dedupedSignals.length * 10);
  const confidence = Math.max(15, Math.min(100, Math.round(dataCompleteness * 0.7 + signalRichness)));

  // Classificação final rigorosa (nunca afirma "Verificada" apenas por risco zero)
  let status;
  if (dataCompleteness < 40 && riskScore < 20) {
    status = "Dados insuficientes";
  } else if (riskScore >= 80) {
    status = "Risco crítico";
  } else if (riskScore >= 60) {
    status = "Alto risco";
  } else if (riskScore >= 40) {
    status = "Suspeita";
  } else if (riskScore >= 20) {
    status = "Atenção";
  } else if (companyInfo?.status === "Empresa verificada" && dedupedSignals.length === 0) {
    status = "Sem sinais relevantes identificados";
  } else {
    status = "Sem sinais relevantes identificados";
  }

  const recommendations = [];
  if (categorySums.payment_request > 0) recommendations.push("Não realize qualquer pagamento, PIX ou compra de kit para participar do processo.");
  if (categorySums.phishing_data > 0) recommendations.push("Não envie fotos de documentos (CPF/RG/CNH), selfies ou dados bancários antes da contratação formal.");
  if (categorySums.domain_url > 0) recommendations.push("Verifique se a vaga está publicada no site oficial de carreiras da empresa.");
  if (ghostJob?.isGhost) recommendations.push("Confirme se a vaga ainda está ativa — há indícios de anúncio desatualizado ou Ghost Job.");
  if (!recommendations.length && status === "Dados insuficientes") {
    recommendations.push("Anúncio com poucas informações; pesquise a empresa antes de compartilhar dados.");
  } else if (!recommendations.length) {
    recommendations.push("Mantenha boas práticas: candidate-se apenas por canais oficiais da empresa.");
  }

  return {
    riskScore,
    status,
    confidence,
    isFake: riskScore >= 60,
    isSuspicious: riskScore >= 25,
    signals: dedupedSignals,
    recommendations,
    categoryScores: categorySums,
  };
}
