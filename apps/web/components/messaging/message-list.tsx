"use client";

import { Flag } from "lucide-react";

export interface ThreadMessage {
  id: string;
  moi: boolean;
  auteur: string;
  /** Vide quand le message a été retiré par la Direction. */
  texte: string | null;
  retire: boolean;
  date: string;
  signale: boolean;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Fil de messages : les miens à droite, ceux de l'autre à gauche. Un message retiré n'est plus lisible. */
export function MessageList({ messages, onReport }: { messages: ThreadMessage[]; onReport?: (id: string) => void }) {
  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li key={m.id} className={`flex ${m.moi ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.moi ? "bg-primary text-white" : "border border-border bg-surface text-ink"}`}>
            <p className={`mb-0.5 text-xs font-medium ${m.moi ? "text-white/70" : "text-ink-muted"}`}>
              {m.auteur} · {formatDateTime(m.date)}
            </p>
            {m.retire ? (
              <p className={`text-sm italic ${m.moi ? "text-white/80" : "text-ink-muted"}`}>Ce message a été retiré par la Direction.</p>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{m.texte}</p>
            )}
            {onReport && !m.moi && !m.retire && (
              <div className="mt-1.5 text-right">
                {m.signale ? (
                  <span className="text-xs text-ink-muted">Signalé à la Direction</span>
                ) : (
                  <button type="button" onClick={() => onReport(m.id)} className="inline-flex items-center gap-1 text-xs text-ink-muted underline hover:text-danger">
                    <Flag size={12} /> Signaler à la Direction
                  </button>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
