"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { groupClasses, type TeacherClassOption } from "@/lib/teacher-onboarding";

/**
 * Choix des classes : une grande pastille par classe, regroupées par cycle (Maternelle, Primaire, Collège, Lycée) et, s'il y
 * a plusieurs sections, un onglet par section. Plusieurs classes peuvent être cochées.
 */
export function ClassPicker({ options, selected, onToggle }: { options: TeacherClassOption[]; selected: string[]; onToggle: (id: string) => void }) {
  const { t } = useI18n();
  const groups = useMemo(() => groupClasses(options), [options]);
  const [tab, setTab] = useState(0);
  const group = groups[Math.min(tab, groups.length - 1)];
  const chosen = new Set(selected);
  if (!group) return null;

  return (
    <div>
      {groups.length > 1 && (
        <div role="tablist" aria-label={t("tco.w.classes.sections")} className="mb-4 flex gap-1.5 rounded-2xl bg-surface-muted p-1">
          {groups.map((g, i) => {
            const count = g.cycles.reduce((n, c) => n + c.classes.filter((x) => chosen.has(x.id)).length, 0);
            return (
              <button
                key={g.section}
                type="button"
                role="tab"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${i === tab ? "bg-surface text-primary shadow-[var(--shadow-soft)]" : "text-ink-muted"}`}
              >
                {g.section}
                {count > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[11px] text-white">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-5">
        {group.cycles.map((c) => (
          <section key={c.cycle} aria-label={c.cycle}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{c.cycle}</h3>
            <div className="flex flex-wrap gap-2.5">
              {c.classes.map((cls) => {
                const on = chosen.has(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(cls.id)}
                    className={`inline-flex min-h-12 items-center gap-1.5 rounded-2xl border-2 px-4 py-2 text-base font-semibold transition-colors ${on ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink active:bg-surface-muted"}`}
                  >
                    {on && <Check size={16} aria-hidden />}
                    {cls.nom}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
