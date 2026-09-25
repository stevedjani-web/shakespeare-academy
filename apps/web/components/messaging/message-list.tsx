"use client";

import { Flag } from "lucide-react";
import { priorityText, type MessagePriority } from "@/lib/message-priority";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/store";
import { useI18n } from "@/lib/i18n/use-i18n";

export interface ThreadMessage {
  id: string;
  moi: boolean;
  auteur: string;
  /** Vide quand le message a été retiré par la Direction. */
  texte: string | null;
  /** Absente sur d'anciennes réponses : comptée comme normale. */
  priorite?: MessagePriority;
  retire: boolean;
  date: string;
  signale: boolean;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(INTL_LOCALE[getLocale()], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Un message important ou urgent se reconnaît de loin (couleur du cadre) et se lit (libellé et icône) : la couleur
// seule ne suffit pas. Mes messages gardent leur fond, seul un anneau de couleur les signale.
const OTHER_BUBBLE: Record<MessagePriority, string> = {
  NORMALE: "border border-border bg-surface text-ink",
  IMPORTANTE: "border-2 border-warning bg-warning-soft text-ink",
  URGENTE: "border-2 border-danger bg-danger-soft text-ink",
};
const MY_RING: Record<MessagePriority, string> = {
  NORMALE: "",
  IMPORTANTE: "ring-2 ring-warning ring-offset-2 ring-offset-surface",
  URGENTE: "ring-2 ring-danger ring-offset-2 ring-offset-surface",
};
const CHIP: Record<MessagePriority, string> = {
  NORMALE: "",
  IMPORTANTE: "border-warning text-warning",
  URGENTE: "border-danger text-danger",
};

/** Fil de messages : les miens à droite, ceux de l'autre à gauche. Un message retiré n'est plus lisible. */
export function MessageList({ messages, onReport }: { messages: ThreadMessage[]; onReport?: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const priorite = m.retire ? "NORMALE" : (m.priorite ?? "NORMALE");
        return (
          <li key={m.id} className={`flex ${m.moi ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.moi ? `bg-primary text-white ${MY_RING[priorite]}` : OTHER_BUBBLE[priorite]}`}
            >
              {priorite !== "NORMALE" && (
                <span className={`mb-1 inline-flex items-center rounded-full border bg-surface px-2 py-0.5 text-xs font-semibold ${CHIP[priorite]}`}>
                  {priorityText(priorite)}
                </span>
              )}
              <p className={`mb-0.5 text-xs font-medium ${m.moi ? "text-white/70" : "text-ink-muted"}`}>
                {m.auteur} · {formatDateTime(m.date)}
              </p>
              {m.retire ? (
                <p className={`text-sm italic ${m.moi ? "text-white/80" : "text-ink-muted"}`}>{t("msg.removed")}</p>
              ) : (
                <p className="whitespace-pre-wrap text-sm">{m.texte}</p>
              )}
              {onReport && !m.moi && !m.retire && (
                <div className="mt-1.5 text-right">
                  {m.signale ? (
                    <span className="text-xs text-ink-muted">{t("msg.reportedShort")}</span>
                  ) : (
                    <button type="button" onClick={() => onReport(m.id)} className="inline-flex items-center gap-1 text-xs text-ink-muted underline hover:text-danger">
                      <Flag size={12} /> {t("msg.report")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
