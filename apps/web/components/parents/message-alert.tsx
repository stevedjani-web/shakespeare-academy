"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { priorityText, type MessagePriority } from "@/lib/message-priority";

export interface UnreadPreview {
  total: number;
  threads: number;
  messages: Array<{
    id: string;
    threadId: string;
    enfant: { id: string; prenom: string };
    expediteur: string;
    extrait: string;
    priorite: MessagePriority;
    date: string;
  }>;
}

const POLL_MS = 30_000;

function when(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Bandeau d'alerte de l'espace parents : dès qu'un message n'est pas lu, son début est affiché en haut de chaque
// page (connexion, retour sur l'onglet, nouveau message reçu pendant la visite). Il reste jusqu'à la lecture ou
// jusqu'à ce que le parent le masque. Le texte entier n'est jamais envoyé : seulement un extrait, dans
// l'application connectée (les alertes push, elles, restent sans contenu, RV10).
export function MessageAlert() {
  const pathname = usePathname();
  const [preview, setPreview] = useState<UnreadPreview | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      setPreview(await portalApi.get<UnreadPreview>("/portal/messages/unread-preview"));
    } catch {
      // Le bandeau ne doit jamais gêner : sans réponse, on garde ce qui est affiché.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onBack = () => void refresh();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [refresh]);

  // Dans la messagerie, le parent lit déjà ses messages.
  if (pathname.startsWith("/parents/messages")) return null;
  const shown = preview?.messages.filter((m) => !dismissed.has(m.id)) ?? [];
  if (!preview || shown.length === 0) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      className={`sticky top-2 z-30 mb-4 rounded-2xl p-3.5 shadow-[var(--shadow-lift)] ${
        shown.some((m) => m.priorite === "URGENTE")
          ? "border-2 border-danger bg-danger-soft"
          : "border border-accent/50 bg-accent-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <MessageSquare size={18} className="text-primary" />
          {preview.total === 1 ? "Vous avez un nouveau message" : `Vous avez ${preview.total} nouveaux messages`}
        </p>
        <button
          type="button"
          onClick={() => setDismissed((prev) => new Set([...prev, ...shown.map((m) => m.id)]))}
          aria-label="Masquer cette alerte"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>
      <ul className="mt-2.5 space-y-2">
        {shown.map((m) => (
          <li key={m.id}>
            <Link href={`/parents/messages/${m.threadId}`} className="block rounded-xl bg-surface px-3 py-2 hover:bg-surface-muted">
              {m.priorite !== "NORMALE" && (
                <span
                  className={`mb-1 inline-flex items-center rounded-full border bg-surface px-2 py-0.5 text-xs font-semibold ${
                    m.priorite === "URGENTE" ? "border-danger text-danger" : "border-warning text-warning"
                  }`}
                >
                  {priorityText(m.priorite)}
                </span>
              )}
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-ink">
                  {m.expediteur} <span className="font-normal text-ink-muted">· pour {m.enfant.prenom}</span>
                </span>
                <span className="shrink-0 text-ink-muted">{when(m.date)}</span>
              </span>
              <span className="mt-0.5 block break-words text-sm text-ink">{m.extrait}</span>
              <span className="mt-1 block text-xs font-medium text-primary">Lire le message</span>
            </Link>
          </li>
        ))}
      </ul>
      {(preview.total > shown.length || preview.threads > 1) && (
        <Link href="/parents/messages" className="mt-2 inline-block text-sm font-medium text-primary underline">
          Voir toutes les conversations
        </Link>
      )}
    </section>
  );
}
