"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Choix des matières (collège et lycée) : une recherche et de grandes pastilles à cocher. */
export function SubjectPicker({ subjects, selected, onToggle }: { subjects: Array<{ id: string; nom: string }>; selected: string[]; onToggle: (id: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return subjects.filter((m) => !q || norm(m.nom).includes(q));
  }, [subjects, query]);
  const chosen = new Set(selected);

  return (
    <div>
      <div className="relative mb-3">
        <Search size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("tco.w.subjects.search")}
          aria-label={t("tco.w.subjects.search")}
          className="w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div className="flex flex-wrap gap-2.5">
        {shown.length === 0 && <p className="text-sm text-ink-muted">{t("tco.w.subjects.none")}</p>}
        {shown.map((m) => {
          const on = chosen.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(m.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 py-2 text-[15px] font-medium transition-colors ${on ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink active:bg-surface-muted"}`}
            >
              {on && <Check size={15} aria-hidden />}
              {m.nom}
            </button>
          );
        })}
      </div>
    </div>
  );
}
