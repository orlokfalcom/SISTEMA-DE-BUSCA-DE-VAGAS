/**
 * Facade de compatibilidade retroativa para o sistema antifraude VagaPulse AI 2.0.
 */

export {
  evaluateJobAuthenticity,
  evaluateJobAuthenticityAsync,
  evaluateJobsBatch,
} from "./fraud/evaluateJobAuthenticity.js";
export { buildCorpusStats } from "./fraud/behaviorAnalyzer.js";
export { detectGhostJob } from "./fraud/ghostJobDetector.js";
export { analyzeDomainAndUrl } from "./fraud/domainAnalyzer.js";
export { analyzeCompanyReputation } from "./fraud/companyAnalyzer.js";
