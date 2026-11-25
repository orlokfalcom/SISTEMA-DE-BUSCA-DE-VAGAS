/**
 * VagaPulse AI — Web Worker de Embeddings Semânticos Locais (Transformers.js + MiniLM)
 * Lazy-loaded apenas após análise do currículo; degradação elegante para BM25 caso offline.
 */

let extractorPromise = null;
let unavailableReason = null;
const cachedJobVectors = new Map(); // id -> Array<number>

async function getExtractor() {
  if (unavailableReason) throw new Error(unavailableReason);
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    try {
      const { pipeline, env } = await import(
        "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js"
      );
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        dtype: "q8",
      });
    } catch (err) {
      unavailableReason = err?.message || "Embeddings CDN/WASM indisponível — usando fallback BM25";
      throw new Error(unavailableReason);
    }
  })();

  return extractorPromise;
}

async function embedText(extractor, text) {
  const truncated = String(text || "").slice(0, 1200);
  const output = await extractor(truncated, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

self.addEventListener("message", async (event) => {
  const { type, requestId, payload } = event.data || {};
  if (type !== "COMPUTE_EMBEDDINGS") return;

  try {
    self.postMessage({ type: "EMBEDDINGS_STATUS", requestId, status: "loading_model" });
    const extractor = await getExtractor();

    const candidateText = String(payload.candidateText || "");
    const candidateEmbedding = candidateText ? await embedText(extractor, candidateText) : null;

    const jobs = payload.jobs || [];
    const jobVectors = [];
    const toCompute = [];

    for (const j of jobs) {
      const id = String(j.id);
      if (cachedJobVectors.has(id)) {
        jobVectors.push({ id, vector: cachedJobVectors.get(id) });
      } else {
        toCompute.push(j);
      }
    }

    self.postMessage({
      type: "EMBEDDINGS_STATUS",
      requestId,
      status: "embedding_jobs",
      total: toCompute.length,
    });

    // Processa em lotes pequenos para enviar progresso incremental sem pressionar memória
    const BATCH_SIZE = 12;
    for (let i = 0; i < toCompute.length; i += BATCH_SIZE) {
      const slice = toCompute.slice(i, i + BATCH_SIZE);
      for (const j of slice) {
        const text = `${j.title || ""}. ${(j.skills || []).join(", ")}. ${j.description || ""}`;
        const vec = await embedText(extractor, text);
        const id = String(j.id);
        cachedJobVectors.set(id, vec);
        jobVectors.push({ id, vector: vec });
      }
      self.postMessage({
        type: "EMBEDDINGS_PROGRESS",
        requestId,
        completed: Math.min(i + BATCH_SIZE, toCompute.length),
        total: toCompute.length,
      });
    }

    self.postMessage({
      type: "EMBEDDINGS_READY",
      requestId,
      payload: {
        candidateEmbedding,
        jobVectors,
        model: "Xenova/all-MiniLM-L6-v2 (q8)",
      },
    });
  } catch (err) {
    self.postMessage({
      type: "EMBEDDINGS_FALLBACK",
      requestId,
      reason: err?.message || "Fallback BM25 ativado",
    });
  }
});
