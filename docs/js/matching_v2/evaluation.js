/**
 * VagaPulse AI 2.0 — Métricas Estatísticas Reais de IR, Aprendizado Supervisionado & Equidade
 */

import { MATCH_WEIGHTS, WEIGHT_VERSION, normalizeMatchWeights } from "./weights.js";

const EVENT_REWARD_MAP = {
  click: 0.15,
  interest: 0.45,
  applied: 0.65,
  interview: 0.90,
  approved: 1.0,
  hired: 1.0,
  dislike: -0.75,
};

const weightVersionHistory = [{ version: WEIGHT_VERSION, weights: { ...MATCH_WEIGHTS }, reason: "initial" }];

/**
 * Calcula métricas reais de IR (Precision@K, Recall@K, NDCG@K, MAP, MRR, FPR, FNR, Cobertura, Calibração).
 * Nunca retorna estimativas disfarçadas de métricas reais quando não há avaliações.
 */
export function computeRankingQualityMetricsV2(rankedJobs = [], feedbackMap = {}, k = 10) {
  const topK = rankedJobs.slice(0, k);
  let evaluatedTopK = 0;
  let positivesTopK = 0;
  let totalLikes = 0;
  let totalDislikes = 0;
  let totalClicks = 0;
  let totalApplied = 0;
  let totalInterviews = 0;

  let totalRelevantInCorpus = 0;
  let fp = 0;
  let fn = 0;
  let tp = 0;
  let tn = 0;

  for (const job of rankedJobs) {
    const fb = feedbackMap?.[job.id];
    if (!fb) continue;
    const isRelevant = fb.vote === 1 || fb.stage === "interview" || fb.stage === "approved" || fb.stage === "hired";
    const isNegative = fb.vote === -1;
    const predictedPositive = (job.match_score || 0) >= 60;

    if (isRelevant) {
      totalRelevantInCorpus++;
      if (predictedPositive) tp++;
      else fn++;
    } else if (isNegative) {
      if (predictedPositive) fp++;
      else tn++;
    }
  }

  for (const fb of Object.values(feedbackMap || {})) {
    if (!fb) continue;
    if (fb.vote === 1) totalLikes++;
    if (fb.vote === -1) totalDislikes++;
    if (fb.clicked) totalClicks++;
    if (fb.stage === "applied" || fb.stage === "interview" || fb.stage === "approved" || fb.stage === "hired") totalApplied++;
    if (fb.stage === "interview" || fb.stage === "approved" || fb.stage === "hired") totalInterviews++;
  }

  let dcg = 0;
  let apSum = 0;
  let hits = 0;
  let mrr = null;
  let calibrationErrors = [];

  topK.forEach((job, idx) => {
    const rank = idx + 1;
    const fb = feedbackMap?.[job.id];
    if (!fb) return;

    const hasExplicit = fb.vote === 1 || fb.vote === -1 || fb.stage;
    if (!hasExplicit && !fb.clicked) return;

    evaluatedTopK++;
    const rel = fb.stage === "interview" || fb.stage === "hired" ? 2 : (fb.vote === 1 || (fb.clicked && fb.vote !== -1) ? 1 : 0);
    if (rel > 0) {
      positivesTopK++;
      hits++;
      dcg += (Math.pow(2, rel) - 1) / Math.log2(rank + 1);
      apSum += hits / rank;
      if (mrr === null) mrr = 1 / rank;
    }
    if (fb.vote === 1 || fb.vote === -1) {
      const actual = fb.vote === 1 ? 1 : 0;
      calibrationErrors.push(Math.abs((job.match_score || 0) / 100 - actual));
    }
  });

  const idealRels = Array.from({ length: Math.min(k, Math.max(positivesTopK, 1)) }, () => 1);
  const idcg = idealRels.reduce((acc, rel, idx) => acc + (Math.pow(2, rel) - 1) / Math.log2(idx + 2), 0);

  const isUserMeasured = evaluatedTopK > 0;
  const precisionAtK = isUserMeasured ? Math.round((positivesTopK / evaluatedTopK) * 100) : null;
  const recallAtK = totalRelevantInCorpus > 0 ? Math.round((positivesTopK / totalRelevantInCorpus) * 100) : null;
  const ndcgAtK = isUserMeasured && idcg > 0 ? Math.round((dcg / idcg) * 1000) / 1000 : null;
  const mapScore = hits > 0 ? Math.round((apSum / hits) * 1000) / 1000 : null;
  const fpr = fp + tn > 0 ? Math.round((fp / (fp + tn)) * 1000) / 1000 : null;
  const fnr = fn + tp > 0 ? Math.round((fn / (fn + tp)) * 1000) / 1000 : null;
  const calibrationError = calibrationErrors.length
    ? Math.round((calibrationErrors.reduce((a, b) => a + b, 0) / calibrationErrors.length) * 1000) / 1000
    : null;
  const interviewRate = totalApplied > 0 ? Math.round((totalInterviews / totalApplied) * 100) : null;
  const coverage = rankedJobs.length ? Math.round((rankedJobs.filter((j) => (j.data_coverage || 0) >= 50).length / rankedJobs.length) * 100) : 0;

  return {
    k,
    precisionAtK,
    recallAtK,
    ndcgAtK,
    map: mapScore,
    mrr: mrr !== null ? Math.round(mrr * 1000) / 1000 : null,
    fpr,
    fnr,
    coverage,
    calibrationError,
    interviewRate,
    isUserMeasured,
    evaluatedTopK,
    positivesTopK,
    totalLikes,
    totalDislikes,
    totalClicks,
  };
}

/**
 * Aprendizado supervisionado com controle de deriva, lote mínimo e versionamento/rollback.
 * Não altera pesos globais com base em um único clique ou feedback isolado.
 */
export function adaptWeightsFromFeedbackV2(currentWeights, events = [], lr = 0.03, minBatchSize = 3) {
  const base = normalizeMatchWeights(currentWeights, MATCH_WEIGHTS);
  const validEvents = (Array.isArray(events) ? events : []).filter(
    (e) => e && e.breakdown && (e.type !== "click") && Object.prototype.hasOwnProperty.call(EVENT_REWARD_MAP, e.type)
  );
  if (validEvents.length < minBatchSize) {
    return { weights: base, updated: false, version: weightVersionHistory[weightVersionHistory.length - 1].version, reason: "Amostra insuficiente para atualização segura (mínimo 3 sinais explícitos)." };
  }

  const keys = Object.keys(MATCH_WEIGHTS);
  const delta = Object.fromEntries(keys.map((k) => [k, 0]));

  for (const ev of validEvents) {
    const reward = Math.max(-1, Math.min(1, EVENT_REWARD_MAP[ev.type] || 0));
    const feats = keys.map((k) => (Number(ev.breakdown[k]) || 0) / 100);
    const mean = feats.reduce((a, b) => a + b, 0) / keys.length;
    keys.forEach((k, idx) => {
      delta[k] += lr * reward * (feats[idx] - mean);
    });
  }

  const next = { ...base };
  for (const k of keys) {
    const avgStep = Math.max(-0.04, Math.min(0.04, delta[k] / validEvents.length)); // limite de deriva
    next[k] = base[k] + avgStep;
  }

  const normalized = normalizeMatchWeights(next, MATCH_WEIGHTS);
  const newVersion = `2.0.${weightVersionHistory.length}`;
  weightVersionHistory.push({ version: newVersion, weights: { ...normalized }, reason: `batch_${validEvents.length}` });
  if (weightVersionHistory.length > 30) weightVersionHistory.shift();

  return { weights: normalized, updated: true, version: newVersion };
}

export function rollbackWeightsVersion(stepsBack = 1) {
  const idx = Math.max(0, weightVersionHistory.length - 1 - stepsBack);
  return { ...weightVersionHistory[idx] };
}

/**
 * Auditoria anti-discriminação: verifica que nenhum atributo protegido é utilizado no cálculo.
 */
export function auditFairnessCompliance(scoreBreakdown = {}) {
  const forbiddenKeys = new Set(["age", "idade", "gender", "sexo", "race", "raca", "religion", "religiao", "sexual_orientation", "disability", "pcd_status", "marital_status", "estado_civil"]);
  const usedKeys = Object.keys(scoreBreakdown || {}).map((k) => k.toLowerCase());
  const violations = usedKeys.filter((k) => forbiddenKeys.has(k));
  return {
    compliant: violations.length === 0,
    violations,
    evaluatedDimensions: usedKeys.length,
  };
}
