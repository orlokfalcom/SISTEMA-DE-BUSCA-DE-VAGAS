/**
 * VagaPulse AI — Persistência Local Privada (IndexedDB + Fallback localStorage)
 * Armazena feedback do usuário (👍/👎), pesos aprendidos pelo bandit/regressão, tracker e cache de API.
 */

const DB_NAME = "vagapulse_ai_db";
const DB_VERSION = 1;
const STORE_KV = "kv_store";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key, fallback = null) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_KV, "readonly");
      const req = tx.objectStore(STORE_KV).get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback);
      req.onerror = () => resolve(fallback);
    });
  } catch {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(`vp_${key}`) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
}

export async function idbSet(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`vp_${key}`, JSON.stringify(value));
    }
  } catch {
    // ignore quota errors
  }
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_KV, "readwrite");
      tx.objectStore(STORE_KV).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // fallback already written to localStorage
  }
}
