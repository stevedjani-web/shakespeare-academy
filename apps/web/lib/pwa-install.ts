"use client";

import { useSyncExternalStore } from "react";

// Installation de l'application sur l'écran d'accueil. Chrome/Edge/Android fournissent un évènement
// `beforeinstallprompt` (une seule fois, tôt) qu'il faut garder pour déclencher la vraie fenêtre
// d'installation au clic. iOS/Safari n'a pas cette API : on explique la manœuvre manuelle.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
let started = false;

function emit(): void {
  snapshot = null;
  for (const l of listeners) l();
}

function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function startInstallWatch(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  installed = isStandaloneNow();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export interface InstallState {
  /** L'application est déjà ouverte comme une application installée. */
  standalone: boolean;
  /** Le navigateur propose la vraie fenêtre d'installation. */
  canPrompt: boolean;
  ios: boolean;
}

let snapshot: InstallState | null = null;
const serverSnapshot: InstallState = { standalone: false, canPrompt: false, ios: false };

function getSnapshot(): InstallState {
  if (!snapshot) {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    snapshot = {
      standalone: installed || isStandaloneNow(),
      canPrompt: deferred !== null,
      ios: /iphone|ipad|ipod/i.test(ua),
    };
  }
  return snapshot;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      startInstallWatch();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    () => serverSnapshot,
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const choice = await event.userChoice;
  deferred = null;
  emit();
  return choice.outcome === "accepted";
}
