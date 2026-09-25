"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageSquare, X } from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { priorityText, type MessagePriority } from "@/lib/message-priority";
import { alertTitle, notificationTarget, type ParentNotificationType } from "@/lib/parent-alerts";

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

interface NotificationItem {
  id: string;
  type: ParentNotificationType;
  titre: string;
  corps: string;
  enfant: { id: string; prenom: string };
  lue: boolean;
  date: string;
}

const POLL_MS = 30_000;
// Au plus quatre éléments à la fois (messages d'abord) : sur un téléphone, le bandeau ne doit pas prendre tout l'écran.
const MAX_ITEMS = 4;

function when(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Bandeau d'alerte de l'espace parents : dès qu'un message ou une notification n'est pas lu, il s'affiche en haut de
// chaque page (connexion, retour sur l'onglet, nouveauté reçue pendant la visite). Il reste jusqu'à la lecture ou
// jusqu'à ce que le parent le masque. Pour un message, seul un extrait est montré, jamais le texte entier ; les
// notifications gardent leur texte, déjà générique. Les alertes push, elles, restent sans contenu (RV10).
export function ParentAlert() {
  const pathname = usePathname();
  const router = useRouter();
  const [preview, setPreview] = useState<UnreadPreview | null>(null);
  const [others, setOthers] = useState<NotificationItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    // Deux sources indépendantes : l'échec de l'une ne masque pas l'autre. Sans réponse, on garde ce qui est affiché.
    const [messages, notifications] = await Promise.allSettled([
      portalApi.get<UnreadPreview>("/portal/messages/unread-preview"),
      portalApi.get<{ nonLues: number; notifications: NotificationItem[] }>("/portal/notifications"),
    ]);
    if (messages.status === "fulfilled") setPreview(messages.value);
    if (notifications.status === "fulfilled") {
      // Les notifications de message sont déjà couvertes par l'aperçu des messages, avec leur début.
      setOthers(notifications.value.notifications.filter((n) => !n.lue && n.type !== "MESSAGE_RECU"));
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

  async function openNotification(n: NotificationItem) {
    try {
      await portalApi.patch(`/portal/notifications/${n.id}/read`);
    } catch {
      // Ne pas empêcher d'ouvrir la page si le marquage échoue.
    }
    setOthers((prev) => prev.filter((x) => x.id !== n.id));
    router.push(notificationTarget(n.type, n.enfant.id));
  }

  // Dans la messagerie ou la liste des notifications, le parent lit déjà ce que le bandeau lui montrerait.
  const inMessages = pathname.startsWith("/parents/messages");
  const inNotifications = pathname.startsWith("/parents/notifications");
  const shownMessages = inMessages ? [] : (preview?.messages.filter((m) => !dismissed.has(m.id)) ?? []).slice(0, MAX_ITEMS);
  const shownOthers = inNotifications ? [] : others.filter((n) => !dismissed.has(n.id)).slice(0, Math.max(0, MAX_ITEMS - shownMessages.length));
  if (shownMessages.length === 0 && shownOthers.length === 0) return null;

  // Les messages masqués ne comptent plus dans le titre ; ceux qui ne tiennent pas dans le bandeau, si.
  const dismissedMessages = preview?.messages.filter((m) => dismissed.has(m.id)).length ?? 0;
  const totalMessages = inMessages ? 0 : Math.max(0, (preview?.total ?? 0) - dismissedMessages);
  const totalOthers = inNotifications ? 0 : others.filter((n) => !dismissed.has(n.id)).length;
  const urgent = shownMessages.some((m) => m.priorite === "URGENTE");

  return (
    <section
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-2xl p-3.5 shadow-[var(--shadow-lift)] ${
        urgent ? "border-2 border-danger bg-danger-soft" : "border border-accent/50 bg-accent-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <MessageSquare size={18} className="text-primary" />
          {alertTitle(totalMessages, totalOthers)}
        </p>
        <button
          type="button"
          onClick={() => setDismissed((prev) => new Set([...prev, ...shownMessages.map((m) => m.id), ...shownOthers.map((n) => n.id)]))}
          aria-label="Masquer cette alerte"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      {shownMessages.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {shownMessages.map((m) => (
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
      )}

      {shownOthers.length > 0 && (
        <ul className={`space-y-2 ${shownMessages.length > 0 ? "mt-2" : "mt-2.5"}`}>
          {shownOthers.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => void openNotification(n)} className="block w-full rounded-xl bg-surface px-3 py-2 text-left hover:bg-surface-muted">
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <Bell size={12} className="text-primary" />
                    {n.titre} <span className="font-normal text-ink-muted">· {n.enfant.prenom}</span>
                  </span>
                  <span className="shrink-0 text-ink-muted">{when(n.date)}</span>
                </span>
                <span className="mt-0.5 block break-words text-sm text-ink">{n.corps}</span>
                <span className="mt-1 block text-xs font-medium text-primary">Voir</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalMessages > shownMessages.length && (
        <Link href="/parents/messages" className="mt-2 mr-4 inline-block text-sm font-medium text-primary underline">
          Voir toutes les conversations
        </Link>
      )}
      {totalOthers > shownOthers.length && (
        <Link href="/parents/notifications" className="mt-2 inline-block text-sm font-medium text-primary underline">
          Voir toutes les notifications
        </Link>
      )}
    </section>
  );
}
