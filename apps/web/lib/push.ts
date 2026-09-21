"use client";

import { portalApi } from "@/lib/portal-api";

// Alertes push du portail parents (Lot 12) : standard Web Push, gratuit. Rien n'est envoyé sans que le
// parent l'ait demandé sur CET appareil (permission du navigateur), et l'alerte ne transporte jamais
// de contenu sensible : le détail reste dans l'application.

export type PushSupport = "supported" | "unsupported" | "needs-install";

/** Le navigateur sait-il recevoir des alertes ? Sur iPhone et iPad, seulement depuis l'écran d'accueil. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "supported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // Le service worker n'est enregistré qu'en production (voir PwaRegister) : sans lui, pas d'alerte possible.
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Abonnement actuel de cet appareil, s'il existe. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export type EnableResult = "enabled" | "denied" | "unavailable" | "no-key";

/** Demande la permission puis enregistre cet appareil pour le parent connecté. */
export async function enablePush(): Promise<EnableResult> {
  const reg = await registration();
  if (!reg) return "unavailable";
  const { publicKey } = await portalApi.get<{ publicKey: string | null }>("/portal/push/public-key");
  if (!publicKey) return "no-key";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = subscription.toJSON();
  await portalApi.post("/portal/push/subscriptions", { endpoint: json.endpoint, keys: json.keys });
  return "enabled";
}

/**
 * Retire cet appareil : côté serveur d'abord (le jeton est encore valide), puis dans le navigateur.
 * À appeler aussi à la déconnexion, pour qu'un téléphone partagé ne continue pas de recevoir les
 * alertes du parent précédent.
 */
export async function disablePush(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await portalApi.post("/portal/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Impossible de retirer l'appareil maintenant : sans importance pour la déconnexion.
  }
}
