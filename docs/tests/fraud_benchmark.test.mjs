import {
  evaluateJobAuthenticity,
  evaluateJobAuthenticityAsync,
  evaluateJobsBatch,
} from '../js/fraud.js';
import { buildFraudEvaluationDataset } from './fraud_dataset.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

export async function runFraudBenchmark() {
  const dataset = buildFraudEvaluationDataset();
  assert(dataset.length >= 100, `Dataset deve ter >= 100 cenários, possui ${dataset.length}`);

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const item of dataset) {
    const res = evaluateJobAuthenticity(item.job);
    assert(typeof res.riskScore === 'number' && res.riskScore >= 0 && res.riskScore <= 100, 'riskScore inválido');
    assert(typeof res.confidence === 'number' && res.confidence >= 0 && res.confidence <= 100, 'confidence inválido');
    assert(res.status !== 'Verificada', 'Nunca deve retornar "Verificada" apenas por risco zero');

    if (item.category === 'ghost_job') {
      assert(res.isFake === false, `Ghost job legítimo não deve ser marcado como fraude (${item.id})`);
      if (item.expectedGhost) {
        assert(res.ghostJob.isGhost === true, `Esperado ghostJob.isGhost=true para ${item.id}`);
      }
    }

    if (item.category === 'incomplete_data') {
      assert(res.status === 'Dados insuficientes', `Esperado Dados insuficientes, obtido ${res.status}`);
    }

    if (item.category === 'domain_ssrf') {
      if (item.job.url.includes('127.0.0.1') || item.job.url.includes('169.254.169.254') || item.job.url.includes('192.168')) {
        assert(res.domainAnalysis.ssrfBlocked === true, `SSRF deveria bloquear ${item.job.url}`);
      }
      if (item.job.url.includes('g00gle') || item.job.url.includes('nubnak')) {
        assert(res.signals.some((s) => s.category === 'domain_url'), `Typosquatting não detectado em ${item.job.url}`);
      }
      continue;
    }

    const predictedFake = res.isFake;
    if (item.expectedFake && predictedFake) tp++;
    else if (!item.expectedFake && predictedFake) fp++;
    else if (!item.expectedFake && !predictedFake) tn++;
    else if (item.expectedFake && !predictedFake) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  const fnr = fn + tp > 0 ? fn / (fn + tp) : 0;

  assert(precision >= 0.95, `Precisão abaixo de 0.95: ${precision.toFixed(3)}`);
  assert(recall >= 0.95, `Recall abaixo de 0.95: ${recall.toFixed(3)}`);
  assert(f1 >= 0.95, `F1 abaixo de 0.95: ${f1.toFixed(3)}`);

  // Teste em lote: campanha fraudulenta com descrição idêntica
  const campaignBatch = [
    { id: 'c1', title: 'Assistente A', company: 'Alpha', url: 'https://a.com/1', description: 'Trabalho remoto com atendimento ao cliente e emissão de notas fiscais para e-commerce.' },
    { id: 'c2', title: 'Assistente B', company: 'Beta', url: 'https://b.com/2', description: 'Trabalho remoto com atendimento ao cliente e emissão de notas fiscais para e-commerce.' },
    { id: 'c3', title: 'Assistente C', company: 'Gamma', url: 'https://c.com/3', description: 'Trabalho remoto com atendimento ao cliente e emissão de notas fiscais para e-commerce.' },
  ];
  const batchRes = evaluateJobsBatch(campaignBatch);
  assert(batchRes[0].signals.some((s) => s.category === 'fraudulent_behavior'), 'Campanha duplicada deve gerar sinal comportamental');

  // Teste assíncrono com fallback de IA + Threat Intelligence
  const asyncRes = await evaluateJobAuthenticityAsync(dataset[0].job, {
    aiProvider: null,
    threatConnectors: {
      lookupDomain: async () => ({ malicious: false, provider: 'URLhaus' }),
    },
  });
  assert(asyncRes.aiAssisted === false && asyncRes.riskScore < 20, 'Fallback determinístico deve funcionar sem IA externa');

  return {
    totalScenarios: dataset.length,
    confusionMatrix: { tp, fp, tn, fn },
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    fpr: Number(fpr.toFixed(4)),
    fnr: Number(fnr.toFixed(4)),
  };
}
