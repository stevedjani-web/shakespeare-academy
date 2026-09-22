"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Cycle, Level, Section, Subject } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { BookOpen } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/** Matières (D54) et niveaux auxquels chacune est enseignée. */
export function MatieresTab({
  sections,
  cycles,
  levels,
  levelLabel,
  onChanged,
}: {
  sections: Section[];
  cycles: Cycle[];
  levels: Level[];
  levelLabel: (id: string) => string;
  onChanged: () => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ code: "", nom: "" });
  const [error, setError] = useState<string | null>(null);
  // Niveaux cochés (avec minutes optionnelles) en cours d'édition, par matière.
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const expand = useExpanded();

  async function load() {
    const list = await api.get<Subject[]>("/subjects");
    setSubjects(list);
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch((e) => {
      setError(describeError(e));
      setLoaded(true);
    });
  }, []);

  function draftFor(subject: Subject): Record<string, string> {
    return (
      draft[subject.id] ??
      Object.fromEntries(subject.levels.map((l) => [l.levelId, l.minutesParSemaine ? String(l.minutesParSemaine) : ""]))
    );
  }

  function toggleLevel(subject: Subject, levelId: string, checked: boolean) {
    const current = { ...draftFor(subject) };
    if (checked) current[levelId] = current[levelId] ?? "";
    else delete current[levelId];
    setDraft({ ...draft, [subject.id]: current });
  }

  function setMinutes(subject: Subject, levelId: string, value: string) {
    setDraft({ ...draft, [subject.id]: { ...draftFor(subject), [levelId]: value } });
  }

  async function saveLevels(subject: Subject) {
    setError(null);
    setSavingId(subject.id);
    try {
      const current = draftFor(subject);
      await api.put(`/subjects/${subject.id}/levels`, {
        levels: Object.entries(current).map(([levelId, minutes]) => ({
          levelId,
          minutesParSemaine: minutes ? Number(minutes) : undefined,
        })),
      });
      setDraft((d) => {
        const next = { ...d };
        delete next[subject.id];
        return next;
      });
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSavingId(null);
    }
  }

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/subjects", form);
      setForm({ code: "", nom: "" });
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function toggleActive(subject: Subject) {
    setError(null);
    try {
      await api.patch(`/subjects/${subject.id}`, { actif: !subject.actif });
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function remove(subject: Subject) {
    if (!confirm(`Supprimer la matière « ${subject.nom} » ?`)) return;
    setError(null);
    try {
      await api.delete(`/subjects/${subject.id}`);
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  // Niveaux regroupés par section pour un choix lisible.
  const levelsBySection = sections
    .map((section) => ({
      section,
      levels: levels.filter((l) => cycles.find((c) => c.id === l.cycleId)?.sectionId === section.id),
    }))
    .filter((g) => g.levels.length > 0);

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-ink">Matières</h2>
      <p className={`mb-3 ${TAB_HINT}`}>
        Aucune matière n&apos;est préchargée. Ajoutez celles de l&apos;école, puis cochez les niveaux où chacune est enseignée : c&apos;est ce qui permet ensuite d&apos;affecter un enseignant à une classe.
      </p>
      <ErrorMessage>{error}</ErrorMessage>

      <form onSubmit={addSubject} className="mb-5 space-y-3 border-b border-border pb-4">
        <p className="text-sm font-semibold text-ink">Ajouter une matière</p>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Code">
            <Input required placeholder="MATH" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Nom">
            <Input required placeholder="Mathématiques" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </Field>
        </div>
        <Button type="submit">Ajouter la matière</Button>
      </form>

      {loaded && subjects.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="Aucune matière." description="Ajoutez la première matière ci-dessus." />
      ) : (
        <>
          <ExpandAll count={subjects.length} onOpenAll={() => expand.openAll(subjects.map((s) => s.id))} onCloseAll={expand.closeAll} />
          <ul className="space-y-2">
            {subjects.map((subject) => {
              const expanded = expand.isOpen(subject.id);
              const current = draftFor(subject);
              const changed = !!draft[subject.id];
              return (
                <li key={subject.id} className={`rounded-xl border border-border p-3 ${subject.actif ? "" : "opacity-70"}`}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <ExpandButton open={expanded} onClick={() => expand.toggle(subject.id)} label={subject.nom} />
                    <span className="font-medium text-ink">{subject.nom}</span>
                    <span className="font-mono text-xs text-ink-muted">{subject.code}</span>
                    <Badge color={subject.levels.length > 0 ? "green" : "orange"}>
                      {subject.levels.length > 0 ? `${subject.levels.length} niveau(x)` : "Aucun niveau"}
                    </Badge>
                    {!subject.actif && <Badge color="gray">Désactivée</Badge>}
                  </div>
                  {expanded && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <p className="text-sm font-medium text-ink">Enseignée aux niveaux :</p>
                      {levelsBySection.length === 0 && (
                        <p className={TAB_HINT}>Aucun niveau n&apos;existe encore. Créez la structure académique d&apos;abord.</p>
                      )}
                      {levelsBySection.map((g) => (
                        <div key={g.section.id}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.section.nom}</p>
                          <div className="flex flex-wrap gap-2">
                            {g.levels.map((l) => {
                              const checked = l.id in current;
                              return (
                                <div key={l.id} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm">
                                  <label className="flex items-center gap-1.5">
                                    <input type="checkbox" checked={checked} onChange={(e) => toggleLevel(subject, l.id, e.target.checked)} />
                                    <span title={levelLabel(l.id)}>{l.nom}</span>
                                  </label>
                                  {checked && (
                                    <input
                                      type="number"
                                      min={1}
                                      placeholder="min/sem."
                                      value={current[l.id] ?? ""}
                                      onChange={(e) => setMinutes(subject, l.id, e.target.value)}
                                      className="w-20 rounded-md border border-border px-1.5 py-0.5 text-xs"
                                      aria-label={`Minutes par semaine, ${l.nom}`}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <p className={TAB_HINT}>Le volume par semaine (en minutes) est facultatif et indicatif.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void saveLevels(subject)} disabled={savingId === subject.id || !changed}>
                          {savingId === subject.id ? "Enregistrement…" : "Enregistrer les niveaux"}
                        </Button>
                        <Button variant="secondary" onClick={() => void toggleActive(subject)}>
                          {subject.actif ? "Désactiver" : "Réactiver"}
                        </Button>
                        <Button variant="danger" onClick={() => void remove(subject)}>
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
