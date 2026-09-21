"use client";

import { dbClear, dbGet, dbPut } from "@/lib/offline-db";

// Copie locale des réponses GET de l'API, pour consulter l'application sans Internet.
// Une seule identité à la fois : la copie appartient au dernier utilisateur connecté ; se connecter
// avec un autre compte l'efface (jamais les données d'une personne visibles par une autre).
// Elle est aussi effacée à la déconnexion. La file d'attente des saisies (outbox) n'est, elle,
// jamais effacée automatiquement : ce sont des opérations réelles qui restent à envoyer.

interface CacheEntry {
  data: unknown;
  at: number;
}

const NEVER_CACHE = ["/auth/login", "/auth/refresh", "/auth/logout", "/reports/export/", "/health"];

let owner: string | null = null;
let ownerLoaded = false;

function shouldCache(path: string): boolean {
  return !NEVER_CACHE.some((p) => path.startsWith(p));
}

async function loadOwner(): Promise<string | null> {
  if (!ownerLoaded) {
    owner = (await dbGet<string>("meta", "cacheOwner")) ?? null;
    ownerLoaded = true;
  }
  return owner;
}

export async function getCacheOwner(): Promise<string | null> {
  return loadOwner();
}

/** Déclare l'utilisateur connecté ; si ce n'est pas le propriétaire de la copie locale, elle est vidée. */
export async function setCacheOwner(userId: string): Promise<void> {
  const current = await loadOwner();
  if (current && current !== userId) await dbClear("cache");
  owner = userId;
  ownerLoaded = true;
  await dbPut("meta", "cacheOwner", userId);
}

export async function clearCache(): Promise<void> {
  await dbClear("cache");
  await dbClear("meta");
  owner = null;
  ownerLoaded = true;
}

export async function cachePut(path: string, data: unknown): Promise<void> {
  if (!shouldCache(path)) return;
  if (!(await loadOwner())) return;
  const entry: CacheEntry = { data, at: Date.now() };
  await dbPut("cache", path, entry);
  lastOnlineAt = entry.at;
  if (entry.at - lastPersistedAt > 30000) {
    lastPersistedAt = entry.at;
    await dbPut("meta", "lastOnlineAt", entry.at);
  }
}

let lastOnlineAt = 0;
let lastPersistedAt = 0;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lecture hors ligne. Renvoie `undefined` si rien n'a jamais été copié pour cette adresse. */
export async function cacheRead<T>(path: string): Promise<{ data: T; at: number } | undefined> {
  if (!shouldCache(path) || !(await loadOwner())) return undefined;
  const entry = await dbGet<CacheEntry>("cache", path);
  if (entry) return { data: entry.data as T, at: entry.at };

  // La recherche d'élèves fonctionne hors ligne sur la liste déjà copiée.
  if (path.startsWith("/students/search?q=")) {
    const list = await dbGet<CacheEntry>("cache", "/students");
    if (list && Array.isArray(list.data)) {
      const q = normalize(decodeURIComponent(path.slice("/students/search?q=".length)).trim());
      const rows = (list.data as Array<{ nom: string; prenom: string; matricule: string }>).filter((s) =>
        normalize(`${s.nom} ${s.prenom} ${s.matricule}`).includes(q),
      );
      return { data: rows as unknown as T, at: list.at };
    }
  }
  return undefined;
}

/** Date de la dernière réponse réellement reçue du serveur (affichée dans le bandeau hors ligne). */
export async function getLastOnlineAt(): Promise<number | null> {
  if (lastOnlineAt) return lastOnlineAt;
  const stored = await dbGet<number>("meta", "lastOnlineAt");
  return stored ?? null;
}
