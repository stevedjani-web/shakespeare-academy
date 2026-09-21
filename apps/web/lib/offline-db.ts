// Stockage local du mode hors ligne (IndexedDB) : copie des dernières réponses de l'API (lecture
// hors ligne), file d'attente des saisies à synchroniser, petites valeurs de suivi. Volontairement
// minimal (aucune dépendance) : trois magasins clé/valeur et des fonctions asynchrones simples.
// Toute erreur de stockage (navigation privée, quota, IndexedDB indisponible) est avalée : le mode
// hors ligne se dégrade alors en "pas de cache", jamais en plantage de l'application.

const DB_NAME = "sa-offline";
const DB_VERSION = 1;

export type StoreName = "cache" | "outbox" | "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponible"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ["cache", "outbox", "meta"] as const) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return (await run<T | undefined>(store, "readonly", (s) => s.get(key))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function dbPut<T>(store: StoreName, key: string, value: T): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.put(value, key));
  } catch {
    // stockage plein ou indisponible : on continue sans cache
  }
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.delete(key));
  } catch {
    // rien à faire
  }
}

export async function dbClear(store: StoreName): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.clear());
  } catch {
    // rien à faire
  }
}

export async function dbValues<T>(store: StoreName): Promise<T[]> {
  try {
    return await run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
  } catch {
    return [];
  }
}
