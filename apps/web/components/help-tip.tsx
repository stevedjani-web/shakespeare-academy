"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle, X } from "lucide-react";
import { HELP_CONTENT } from "@/lib/help-content";
import { useI18n } from "@/lib/i18n/use-i18n";

const PANEL_WIDTH = 288; // w-72
const MARGIN = 16;

/**
 * Icône d'aide contextuelle (demande explicite, 23 septembre 2026) : discrète à côté d'un titre, jamais
 * un bandeau permanent — un utilisateur déjà formé n'a rien à ignorer, un nouveau la trouve au même
 * endroit sur chaque écran. Le contenu vient de `lib/help-content.ts`, jamais dupliqué ici.
 *
 * Position calculée en `fixed` à l'ouverture (jamais un simple `absolute` relatif à l'icône) : cette
 * puce apparaît aussi bien tout à gauche d'un titre de page qu'au milieu d'une carte large (ex. « Situation
 * financière » du dossier élève) — un positionnement purement CSS relatif déborderait de l'écran dans ce
 * second cas dès que la fenêtre n'est pas très large (repéré en vérifiant sur un dossier élève réel).
 */
export function HelpTip({ id }: { id: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const entry = HELP_CONTENT[id];

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - PANEL_WIDTH - MARGIN);
    setCoords({ top: rect.bottom + 8, left });

    // Écouteurs posés après le tick courant : sinon un défilement encore en cours (ex. le
    // `scrollIntoView` qui a amené ce bouton à l'écran) ou l'ajustement de la barre d'adresse mobile
    // au moment même de l'ouverture referme le panneau aussitôt affiché, avant que quiconque le lise.
    const close = () => setOpen(false);
    const timer = setTimeout(() => {
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }, 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!entry) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("cnt.help.aria", { title: t(entry.titleKey) })}
        aria-expanded={open}
        className="sa-interactive inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
      >
        <HelpCircle size={14} />
      </button>

      {open && coords && (
        <>
          {/* Referme au clic en dehors, sans écouteur global à retirer soi-même. */}
          <button
            type="button"
            aria-label={t("cnt.help.closeHelp")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            style={{ top: coords.top, left: coords.left, width: PANEL_WIDTH }}
            className="fixed z-50 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 text-left shadow-[var(--shadow-soft)]"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{t(entry.titleKey)}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("cnt.help.close")}
                className="sa-interactive shrink-0 text-ink-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-muted">
              {entry.tipKeys.map((tipKey, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-0.5 text-primary">•</span>
                  <span>{t(tipKey)}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/aide#${entry.id}`}
              onClick={() => setOpen(false)}
              className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
            >
              {t("cnt.help.full")}
            </Link>
          </div>
        </>
      )}
    </>
  );
}
