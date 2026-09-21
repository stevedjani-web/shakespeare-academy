"use client";

import { useSyncExternalStore } from "react";

// État de connexion de l'application. `navigator.onLine` seul est trompeur (un téléphone "connecté"
// à un réseau sans accès réel reste `true`) : l'état bascule à "hors ligne" dès qu'un appel réseau
// échoue, et ne repasse à "en ligne" qu'après une vraie réponse du serveur (appel normal réussi ou
// test de santé périodique).

let online = typeof navigator === "undefined" ? true : navigator.onLine;
const listeners = new Set<() => void>();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let healthUrl = "";
let started = false;

function emit(): void {
  for (const l of listeners) l();
}

export function isOnline(): boolean {
  return online;
}

export function setOnline(value: boolean): void {
  if (online === value) return;
  online = value;
  if (!value) startHeartbeat();
  else stopHeartbeat();
  emit();
  if (value && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sa-online"));
}

async function probe(): Promise<void> {
  if (!healthUrl) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(healthUrl, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) setOnline(true);
  } catch {
    // toujours hors ligne
  }
}

function startHeartbeat(): void {
  if (heartbeat || typeof window === "undefined") return;
  heartbeat = setInterval(() => void probe(), 15000);
}

function stopHeartbeat(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

/** À appeler une fois au démarrage (fournit l'adresse du test de santé, branche les évènements du navigateur). */
export function startConnectivityWatch(apiUrl: string): void {
  healthUrl = `${apiUrl}/health`;
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void probe());
  window.addEventListener("offline", () => setOnline(false));
  if (!online) startHeartbeat();
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}

/** Test immédiat (bouton "Réessayer maintenant"). */
export async function checkConnectivityNow(): Promise<boolean> {
  await probe();
  return online;
}
