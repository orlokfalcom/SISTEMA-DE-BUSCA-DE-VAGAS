/**
 * Orquestrador VagaPulse AI 2.0 — Detecção Multicamadas de Vagas Falsas & Ghost Jobs
 */

import { validateAnalysisOutput, validateJobInput } from "./schemas/validation.js";
import { analyzeLexicalAndSemantic } from "./lexicalAnalyzer.js";
import { analyzeDomainAndUrl } from "./domainAnalyzer.js";
import { analyzeCompanyReputation } from "./companyAnalyzer.js";
import { detectGhostJob } from "./ghostJobDetector.js";
import { analyzeBehaviorAndCampaigns, buildCorpusStats } from "./behaviorAnalyzer.js";
import { analyzeSalaryCoherence } from "./salaryAnalyzer.js";
import { detectPhishingAndDataCollection } from "./phishingDetector.js";
import { computeRiskAndConfidence } from "./riskEngine.js";
import { runOptionalAiClassifier } from "./aiDetector.js";
import { checkThreatIntelligence } from "./threatIntelligence.js";
import { fnv1aHash } from "./utils/normalization.js";

export function evaluateJobAuthenticity(rawJob, options = {}) {
  const job = validateJobInput(rawJob);
  const corpusStats = options.corpusStats || null;

  const lexical = analyzeLexicalAndSemantic(job);
  const domain = analyzeDomainAndUrl(job);
  const company = analyzeCompanyReputation(job, domain.domainInfo, corpusStats);
  const ghostJob = detectGhostJob(job, corpusStats, options.nowMs);
  const behavior = analyzeBehaviorAndCampaigns(job, corpusStats);
  const salary = analyzeSalaryCoherence(job);
  const phishing = detectPhishingAndDataCollection(job);

  const allSignals = [
    ...lexical.signals,
    ...domain.signals,
    ...company.signals,
    ...behavior.signals,
    ...salary.signals,
    ...phishing.signals,
  ];

  const scored = computeRiskAndConfidence({
    job,
    signals: allSignals,
    domainInfo: domain.domainInfo,
    companyInfo: company.companyInfo,
    ghostJob,
  });

  const traceId = `vp2-${fnv1aHash(`${job.id}:${job.title}:${job.url}`)}`;

  return validateAnalysisOutput({
    ...scored,
    ghostJob,
    domainAnalysis: domain.domainInfo,
    companyAnalysis: company.companyInfo,
    aiAssisted: false,
    traceId,
  });
}

/**
 * Versão assíncrona com conectores opcionais de IA e Threat Intelligence.
 */
export async function evaluateJobAuthenticityAsync(rawJob, options = {}) {
  const base = evaluateJobAuthenticity(rawJob, options);
  const job = validateJobInput(rawJob);
  const [aiRes, tiRes] = await Promise.all([
    runOptionalAiClassifier(job, options.aiProvider),
    checkThreatIntelligence(base.domainAnalysis, options.threatConnectors),
  ]);

  if (!aiRes.signals.length && !tiRes.signals.length) {
    return base;
  }

  const mergedSignals = [...base.signals, ...aiRes.signals, ...tiRes.signals];
  const rescored = computeRiskAndConfidence({
    job,
    signals: mergedSignals,
    domainInfo: base.domainAnalysis,
    companyInfo: base.companyAnalysis,
    ghostJob: base.ghostJob,
  });

  return validateAnalysisOutput({
    ...rescored,
    ghostJob: base.ghostJob,
    domainAnalysis: base.domainAnalysis,
    companyAnalysis: base.companyAnalysis,
    aiAssisted: aiRes.available,
    traceId: base.traceId,
  });
}

/**
 * Processamento em lote com correlação comportamental e detecção de campanhas duplicadas.
 */
export function evaluateJobsBatch(jobs = [], options = {}) {
  const corpusStats = buildCorpusStats(jobs);
  return jobs.map((job) => evaluateJobAuthenticity(job, { ...options, corpusStats }));
}
