"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { MAX_OTHER_SUBJECTS, MAX_OTHER_SUBJECT_LENGTH } from "@/lib/teacher-onboarding";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Choix des matières (collège et lycée) : une recherche et de grandes pastilles à cocher. Une matière absente de la liste se
 * tape dans « Autre matière » (le secrétariat la lit et la crée si besoin) : elle compte comme une matière choisie.
 */
export function SubjectPicker({
  subjects,
  selected,
  others,
  onToggle,
  onAddOther,
  onRemoveOther,
}: {
  subjects: Array<{ id: string; nom: string }>;
  selected: string[];
  others: string[];
  onToggle: (id: string) => void;
  onAddOther: (name: string) => void;
  onRemoveOther: (name: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return subjects.filter((m) => !q || norm(m.nom).includes(q));
  }, [subjects, query]);
  const chosen = new Set(selected);
  const full = others.length >= MAX_OTHER_SUBJECTS;

  function addTyped(raw: string) {
    if (!raw.trim() || full) return;
    onAddOther(raw);
    setTyped("");
  }

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
        {shown.length === 0 && (
          <div className="w-full">
            <p className="text-sm text-ink-muted">{t("tco.w.subjects.none")}</p>
            {query.trim() && !full && (
              <button
                type="button"
                onClick={() => {
                  addTyped(query);
                  setQuery("");
                }}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-dashed border-primary px-4 py-2 text-[15px] font-semibold text-primary active:bg-primary-soft"
              >
                <Plus size={15} aria-hidden />
                {t("tco.w.subjects.addTyped", { name: query.trim().slice(0, MAX_OTHER_SUBJECT_LENGTH) })}
              </button>
            )}
          </div>
        )}
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

      <section className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]" aria-label={t("tco.w.subjects.otherTitle")}>
        <h3 className="text-[15px] font-semibold text-ink">{t("tco.w.subjects.otherTitle")}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{t("tco.w.subjects.otherHint")}</p>
        {others.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {others.map((name) => (
              <span key={name} className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-primary bg-primary pl-4 pr-1.5 text-[15px] font-medium text-white">
                {name}
                <button type="button" onClick={() => onRemoveOther(name)} aria-label={t("tco.w.subjects.otherRemove", { name })} className="flex h-8 w-8 items-center justify-center rounded-full active:bg-white/20">
                  <X size={15} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        {full ? (
          <p className="mt-3 text-xs font-medium text-warning">{t("tco.w.subjects.otherLimit", { n: MAX_OTHER_SUBJECTS })}</p>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                // Entrée ajoute la matière sans envoyer le formulaire (donc sans changer d'écran).
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped(typed);
                }
              }}
              maxLength={MAX_OTHER_SUBJECT_LENGTH}
              placeholder={t("tco.w.subjects.otherPlaceholder")}
              aria-label={t("tco.w.subjects.otherTitle")}
              enterKeyHint="done"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            <button
              type="button"
              onClick={() => addTyped(typed)}
              disabled={!typed.trim()}
              className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              <Plus size={16} aria-hidden />
              {t("tco.w.subjects.otherAdd")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
