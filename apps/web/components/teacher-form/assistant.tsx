"use client";

import { ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useI18n } from "@/lib/i18n/use-i18n";

export type AssistantTone = "info" | "success" | "warn";

const BUBBLE: Record<AssistantTone, string> = {
  info: "border-primary/15 bg-primary-soft text-ink",
  success: "border-success/30 bg-success-soft text-ink",
  warn: "border-warning/40 bg-warning-soft text-ink",
};

/**
 * L'assistant de l'école qui accompagne l'enseignant : un petit visage et une bulle qui dit, à chaque écran, quoi faire et
 * pourquoi. Il réagit à ce que la personne saisit (félicite, prévient, explique). Ce n'est pas une IA : les messages sont
 * écrits à l'avance, donc toujours disponibles, gratuits et sans surprise. Les questions fréquentes s'ouvrent à la demande.
 */
export function Assistant({
  tone = "info",
  children,
  help,
  messageKey,
}: {
  tone?: AssistantTone;
  children: React.ReactNode;
  help?: Array<{ q: string; a: string }>;
  // Change quand le message change : rejoue la petite animation d'apparition.
  messageKey: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0" aria-hidden>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[var(--shadow-soft)] ring-2 ring-accent/60">
          <BrandMark className="h-8 w-8 rounded-full" />
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t("tco.w.assistantName")}</p>
        <div key={messageKey} role="status" aria-live="polite" className={`sa-pop rounded-2xl rounded-tl-md border px-4 py-3 text-[15px] leading-relaxed shadow-[var(--shadow-soft)] ${BUBBLE[tone]}`}>
          {children}
        </div>
        {help && help.length > 0 && (
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-1 py-1 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
              {t("tco.w.needHelp")}
              <ChevronDown size={15} aria-hidden className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2">
              {help.map((item) => (
                <details key={item.q} className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm">
                  <summary className="cursor-pointer list-none font-medium text-ink [&::-webkit-details-marker]:hidden">{item.q}</summary>
                  <p className="mt-1.5 leading-relaxed text-ink-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
