/**
 * VagaPulse AI — Web Worker de NLP, Indexação Invertida e Matching Híbrido
 * Executa parsing, indexação BM25 e ranqueamento fora da main thread.
 */

import { extractCanonicalJob, extractCanonicalProfile } from "../nlp.js";
import { InvertedIndex } from "../index.js";
import { computeSkillGaps, matchJobsHybrid } from "../matcher.js";
import { evaluateAtsReadiness } from "../ats.js";

const invertedIndex = new InvertedIndex();
let indexedJobs = [];
const jobEmbeddings = new Map(); // id -> Float32Array
let candidateEmbedding = null;

self.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data || {};
  try {
    if (type === "PARSE_RESUME") {
      const profile = extractCanonicalProfile(payload.rawText, payload.filename, payload.pages);
      profile.ats_audit = evaluateAtsReadiness({
        rawText: payload.rawText,
        pages: profile.pages,
        wordCount: profile.word_count,
        skills: profile.skills,
        email: profile.email,
        phone: profile.phone,
        linkedin: profile.linkedin,
        github: profile.github,
      });
      self.postMessage({ type: "RESUME_PARSED", requestId, payload: { profile } });
      return;
    }

    if (type === "INDEX_JOBS") {
      const t0 = performance.now();
      indexedJobs = (payload.jobs || []).map((j) => (j.canonical ? j : extractCanonicalJob(j)));
      invertedIndex.build(indexedJobs);
      const indexTimeMs = Math.round((performance.now() - t0) * 100) / 100;
      self.postMessage({
        type: "JOBS_INDEXED",
        requestId,
        payload: { indexedCount: invertedIndex.size, indexTimeMs },
      });
      return;
    }

    if (type === "SET_EMBEDDINGS") {
      if (payload.candidateEmbedding) {
        candidateEmbedding = payload.candidateEmbedding;
      }
      if (Array.isArray(payload.jobVectors)) {
        for (const item of payload.jobVectors) {
          if (item && item.id && item.vector) {
            jobEmbeddings.set(String(item.id), item.vector);
          }
        }
      }
      self.postMessage({
        type: "EMBEDDINGS_STORED",
        requestId,
        payload: { count: jobEmbeddings.size, hasCandidate: Boolean(candidateEmbedding) },
      });
      return;
    }

    if (type === "CLEAR_CANDIDATE_EMBEDDING") {
      candidateEmbedding = null;
      return;
    }

    if (type === "MATCH_JOBS") {
      const jobsSource = payload.jobs ? payload.jobs.map((j) => (j.canonical ? j : extractCanonicalJob(j))) : indexedJobs;
      const useIndex = !payload.jobs && indexedJobs.length > 0 ? invertedIndex : null;
      const result = matchJobsHybrid({
        jobs: jobsSource,
        index: useIndex,
        candidateSkills: payload.candidateSkills || [],
        candidateText: payload.candidateText || "",
        candidateSeniority: payload.candidateSeniority || "Pleno",
        candidateSector: payload.candidateSector || "",
        suggestedRoles: payload.suggestedRoles || [],
        userCountry: payload.userCountry || "Brasil",
        candidateEmbedding,
        jobEmbeddings,
        weights: payload.weights,
        feedbackMap: payload.feedbackMap || {},
        filters: payload.filters || {},
      });
      const skillGaps = computeSkillGaps(result.jobs);
      self.postMessage({
        type: "MATCH_RESULT",
        requestId,
        payload: {
          jobs: result.jobs,
          metrics: result.metrics,
          skillGaps,
        },
      });
    }
  } catch (err) {
    self.postMessage({
      type: "WORKER_ERROR",
      requestId,
      error: err?.message || String(err),
    });
  }
});
