/**
 * VagaPulse AI — Índice Invertido & Motor Léxico BM25 em Memória (Sub-10ms)
 * Indexa milhares de vagas no navegador com busca por campo ponderado e BM25 real.
 */

import { tokenize } from "./nlp.js";

const DEFAULT_BM25 = { k1: 1.5, b: 0.75 };

export class InvertedIndex {
  constructor({ k1 = DEFAULT_BM25.k1, b = DEFAULT_BM25.b } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = new Map(); // id -> { doc, len, tf: Map<term, weightedTf> }
    this.postings = new Map(); // term -> Map<id, weightedTf>
    this.df = new Map(); // term -> docCount
    this.avgDocLen = 0;
  }

  clear() {
    this.docs.clear();
    this.postings.clear();
    this.df.clear();
    this.avgDocLen = 0;
  }

  get size() {
    return this.docs.size;
  }

  /**
   * Constrói índice invertido sobre um array de vagas canônicas.
   * Campos ponderados: título (3.0), skills (2.5), empresa/local (1.5), descrição (1.0).
   */
  build(jobs) {
    this.clear();
    let totalLen = 0;

    for (const job of jobs) {
      const id = String(job.id);
      const tf = new Map();
      let docLen = 0;

      const addTokens = (tokens, weight) => {
        for (const term of tokens) {
          tf.set(term, (tf.get(term) || 0) + weight);
          docLen += 1;
        }
      };

      addTokens(tokenize(job.title || ""), 3.0);
      addTokens(tokenize((job.skills || []).join(" ")), 2.5);
      addTokens(tokenize(`${job.company || ""} ${job.location || ""} ${job.sector || ""}`), 1.5);
      addTokens(tokenize(job.description || ""), 1.0);

      this.docs.set(id, { doc: job, len: Math.max(docLen, 1), tf });
      totalLen += Math.max(docLen, 1);

      for (const [term, wtf] of tf.entries()) {
        if (!this.postings.has(term)) this.postings.set(term, new Map());
        this.postings.get(term).set(id, wtf);
        this.df.set(term, (this.df.get(term) || 0) + 1);
      }
    }

    this.avgDocLen = this.docs.size ? totalLen / this.docs.size : 1;
    return this;
  }

  idf(term) {
    const N = Math.max(this.docs.size, 1);
    const freq = this.df.get(term) || 0;
    return Math.log(1 + (N - freq + 0.5) / (freq + 0.5));
  }

  /**
   * Calcula similaridade BM25 normalizada (0..1) entre uma lista de tokens de consulta e um documento indexado.
   */
  bm25Score(queryTerms, docId, maxRefScore = null) {
    const entry = this.docs.get(String(docId));
    if (!entry || !queryTerms.length) return 0;

    const { len, tf } = entry;
    const avgLen = Math.max(this.avgDocLen, 1);
    let rawScore = 0;

    for (const term of queryTerms) {
      const termFreq = tf.get(term);
      if (!termFreq) continue;
      const idfVal = this.idf(term);
      const num = termFreq * (this.k1 + 1);
      const den = termFreq + this.k1 * (1 - this.b + this.b * (len / avgLen));
      rawScore += idfVal * (num / den);
    }

    if (rawScore <= 0) return 0;
    // Normalização suave para faixa [0, 1] relativa ao tamanho da query ou ao maxRefScore do corpus
    const denom = maxRefScore && maxRefScore > 0 ? maxRefScore : Math.max(queryTerms.length * 1.45, 6);
    return Math.min(rawScore / denom, 1);
  }

  /**
   * Executa consulta textual rápida sub-10ms usando apenas as postings lists dos termos da query.
   * Retorna Set<id> ou lista ordenada [{ id, bm25 }] quando returnScores=true.
   */
  search(query, { returnScores = false } = {}) {
    const qTerms = [...new Set(tokenize(query))];
    if (!qTerms.length) {
      if (!returnScores) return null; // null = sem filtro de query
      return [...this.docs.keys()].map((id) => ({ id, bm25: 0 }));
    }

    const candidateScores = new Map();
    for (const term of qTerms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const idfVal = this.idf(term);
      for (const [docId, termFreq] of posting.entries()) {
        const entry = this.docs.get(docId);
        const den = termFreq + this.k1 * (1 - this.b + this.b * (entry.len / Math.max(this.avgDocLen, 1)));
        const contrib = idfVal * ((termFreq * (this.k1 + 1)) / den);
        candidateScores.set(docId, (candidateScores.get(docId) || 0) + contrib);
      }
    }

    if (!returnScores) {
      return new Set(candidateScores.keys());
    }

    let maxScore = 1;
    for (const v of candidateScores.values()) {
      if (v > maxScore) maxScore = v;
    }
    return [...candidateScores.entries()]
      .map(([id, s]) => ({ id, bm25: Math.min(s / maxScore, 1) }))
      .sort((a, b) => b.bm25 - a.bm25);
  }
}
