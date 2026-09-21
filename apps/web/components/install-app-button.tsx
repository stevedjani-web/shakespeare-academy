"use client";

import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/pwa-install";
import { Button } from "@/components/ui";

// Bouton "Installer l'application". Invisible si l'application est déjà installée. Chrome/Android :
// déclenche la vraie fenêtre d'installation ; iOS et navigateurs sans cette API : courte explication.
export function InstallAppButton({ variant = "light", className = "" }: { variant?: "light" | "dark"; className?: string }) {
  const state = useInstallState();
  const [help, setHelp] = useState(false);
  if (state.standalone) return null;

  const dark = variant === "dark";
  return (
    <div className={className}>
      <Button
        variant="secondary"
        className={`w-full ${dark ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : ""}`}
        onClick={() => {
          if (state.canPrompt) void promptInstall();
          else setHelp(true);
        }}
      >
        <Download size={16} /> Installer l&apos;application
      </Button>

      {help && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-4 sm:items-center" onClick={() => setHelp(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-[var(--shadow-lift)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Installer sur ce téléphone</h2>
              <button onClick={() => setHelp(false)} aria-label="Fermer" className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted">
                <X size={18} />
              </button>
            </div>
            {state.ios ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
                <li>
                  Ouvrez cette page dans <strong className="text-ink">Safari</strong>.
                </li>
                <li>
                  Touchez le bouton <Share size={14} className="inline align-text-bottom text-ink" /> <strong className="text-ink">Partager</strong>.
                </li>
                <li>
                  Choisissez <strong className="text-ink">« Sur l&apos;écran d&apos;accueil »</strong>, puis <strong className="text-ink">Ajouter</strong>.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
                <li>
                  Ouvrez cette page dans <strong className="text-ink">Chrome</strong> ou <strong className="text-ink">Edge</strong>.
                </li>
                <li>
                  Touchez le menu <strong className="text-ink">⋮</strong> en haut à droite.
                </li>
                <li>
                  Choisissez <strong className="text-ink">« Installer l&apos;application »</strong> (ou « Ajouter à l&apos;écran d&apos;accueil »).
                </li>
              </ol>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Une fois installée, l&apos;application s&apos;ouvre comme n&apos;importe quelle application et fonctionne aussi sans Internet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
