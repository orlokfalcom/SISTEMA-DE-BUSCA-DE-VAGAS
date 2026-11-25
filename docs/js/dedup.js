/**
 * VagaPulse AI — Deduplicação Fuzzy de Vagas
 * 1. URL canônica (remove utm_* e parâmetros de tracking)
 * 2. Chave exata (título normalizado + empresa normalizada)
 * 3. Similaridade Jaccard >= 0.85 sobre tokens de título + empresa
 */

import { normalizeText } from "./nlp.js";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "source", "fbclid", "gclid", "gh_src",
]);

export function canonicalizeUrl(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s || s === "#") return "";
  try {
    const url = new URL(s);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
  } catch {
    return s.toLowerCase().replace(/\/+$/, "");
  }
}

export function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const item of setA) {
    if (setB.has(item)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function makeTitleTokens(title) {
  const norm = normalizeText(title)
    .replace(/\((?:m\/f\/d|f\/m\/d|pcd|remote|remoto)[^)]*\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  return new Set(norm.split(/\s+/).filter((w) => w.length >= 2));
}

/**
 * Deduplica lista de vagas e retorna estatísticas de deduplicação.
 */
export function deduplicateJobs(jobs, threshold = 0.85) {
  const seenUrls = new Set();
  const seenExact = new Set();
  const companyBuckets = new Map(); // normalizedCompany -> Array<{ titleTokens: Set<string>, job }>
  const unique = [];

  for (const job of jobs) {
    const cUrl = canonicalizeUrl(job.url);
    if (cUrl && seenUrls.has(cUrl)) continue;

    const nTitle = normalizeText(job.title || "");
    const nCompany = normalizeText(job.company || "");
    const exactKey = `${nTitle}::${nCompany}`;
    if (seenExact.has(exactKey)) continue;

    const titleTokens = makeTitleTokens(`${job.title || ""} ${job.company || ""}`);
    const bucketKey = nCompany || "__generic__";
    const bucket = companyBuckets.get(bucketKey) || [];

    let isFuzzyDup = false;
    for (const entry of bucket) {
      if (jaccardSimilarity(titleTokens, entry.titleTokens) >= threshold) {
        isFuzzyDup = true;
        break;
      }
    }
    if (isFuzzyDup) continue;

    if (cUrl) seenUrls.add(cUrl);
    seenExact.add(exactKey);
    bucket.push({ titleTokens, job });
    companyBuckets.set(bucketKey, bucket);
    unique.push(job);
  }

  const totalRaw = jobs.length;
  const duplicatesRemoved = totalRaw - unique.length;
  const dedupRate = totalRaw > 0 ? Math.round((duplicatesRemoved / totalRaw) * 1000) / 10 : 0;

  return {
    jobs: unique,
    totalRaw,
    totalUnique: unique.length,
    duplicatesRemoved,
    dedupRate,
  };
}
