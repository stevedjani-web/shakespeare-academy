"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/pwa-install";
import { Button } from "@/components/ui";
import { Rich } from "@/lib/i18n/rich";
import { useI18n } from "@/lib/i18n/use-i18n";

// Bouton "Installer l'application". Invisible si l'application est déjà installée. Chrome/Android :
// déclenche la vraie fenêtre d'installation ; iOS et navigateurs sans cette API : courte explication.
export function InstallAppButton({ variant = "light", className = "" }: { variant?: "light" | "dark"; className?: string }) {
  const state = useInstallState();
  const { t } = useI18n();
  const [help, setHelp] = useState(false);
  if (state.standalone) return null;

  const dark = variant === "dark";
  const steps = state.ios ? (["install.ios1", "install.ios2", "install.ios3"] as const) : (["install.other1", "install.other2", "install.other3"] as const);
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
        <Download size={16} /> {t("install.button")}
      </Button>

      {help && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-4 sm:items-center" onClick={() => setHelp(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-[var(--shadow-lift)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{t("install.title")}</h2>
              <button onClick={() => setHelp(false)} aria-label={t("common.close")} className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted">
                <X size={18} />
              </button>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
              {steps.map((key) => (
                <li key={key}>
                  <Rich text={t(key)} />
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-muted">{t("install.note")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
