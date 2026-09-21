"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { EvaluationRow, GradeContext } from "@/lib/grades";
import { PERIOD_LABEL } from "@/lib/grades";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { GradeSheetView } from "./grade-sheet";

/** Choix du trimestre, de la classe et de la matière, puis liste des évaluations et création d'une nouvelle. */
export function EvaluationsTab({ context }: { context: GradeContext }) {
  const { hasPermission } = useAuth();
  const canEnter = hasPermission("GRADE_ENTER");
  const [termId, setTermId] = useState(context.trimestres[0]?.id ?? "");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<EvaluationRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ titre: "", date: new Date().toISOString().slice(0, 10), bareme: "", coefficient: "1" });
  const [busy, setBusy] = useState(false);

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of context.affectations) seen.set(a.classId, a.className);
    return [...seen.entries()].map(([id, nom]) => ({ id, nom }));
  }, [context.affectations]);
  const subjects = useMemo(
    () => context.affectations.filter((a) => a.classId === classId),
    [context.affectations, classId],
  );

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);
  useEffect(() => {
    if (!subjects.some((s) => s.subjectId === subjectId)) setSubjectId(subjects[0]?.subjectId ?? "");
  }, [subjects, subjectId]);

  const load = useCallback(async () => {
    if (!termId || !classId || !subjectId) {
      setRows([]);
      return;
    }
    try {
      setRows(await api.get<EvaluationRow[]>(`/grades/evaluations?termId=${termId}&classId=${classId}&subjectId=${subjectId}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [termId, classId, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<{ id: string }>("/grades/evaluations", {
        termId,
        classId,
        subjectId,
        titre: form.titre.trim(),
        date: form.date,
        ...(form.bareme ? { bareme: Number(form.bareme) } : {}),
        coefficient: Number(form.coefficient) || 1,
      });
      setForm({ ...form, titre: "" });
      await load();
      setOpen(created.id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: EvaluationRow) {
    if (!window.confirm(`Supprimer « ${row.titre} » et ses ${row.notes + row.absents + row.dispenses} note(s) ?`)) return;
    try {
      await api.delete(`/grades/evaluations/${row.id}`);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (open) {
    return (
      <GradeSheetView
        evaluationId={open}
        onBack={() => {
          setOpen(null);
          void load();
        }}
      />
    );
  }

  if (context.affectations.length === 0) {
    return (
      <EmptyState
        title="Aucune matière"
        description="Aucune matière ne vous est affectée cette année. La Direction ou l'administration renseigne les affectations dans Vie scolaire."
      />
    );
  }
  if (context.trimestres.length === 0) {
    return (
      <EmptyState
        title="Aucun trimestre"
        description="Les trimestres de l'année active n'ont pas été saisis. La Direction les renseigne dans Vie scolaire, onglet Calendrier."
      />
    );
  }

  const period = rows?.[0]?.periode ?? "OUVERT";
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Trimestre">
            <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
              {context.trimestres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Classe">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Matière">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {period !== "OUVERT" && (
          <p className="mt-3 text-sm text-ink-muted">
            <Badge color="orange">{PERIOD_LABEL[period]}</Badge> On ne peut plus ajouter d&apos;évaluation. La Direction peut rouvrir le trimestre.
          </p>
        )}
      </Card>

      <ErrorMessage>{error}</ErrorMessage>

      {canEnter && period === "OUVERT" && (
        <Card>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Field label="Nouvelle évaluation">
                <Input required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="Ex. Devoir 1" maxLength={120} />
              </Field>
            </div>
            <Field label="Date">
              <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={`Sur (défaut ${context.parametres.baremeDefaut})`}>
              <Input inputMode="numeric" value={form.bareme} onChange={(e) => setForm({ ...form, bareme: e.target.value.replace(/\D/g, "") })} placeholder={String(context.parametres.baremeDefaut)} />
            </Field>
            <Field label="Coefficient">
              <Input inputMode="numeric" value={form.coefficient} onChange={(e) => setForm({ ...form, coefficient: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <div className="sm:col-span-5">
              <Button type="submit" disabled={busy || !form.titre.trim() || !termId || !classId || !subjectId}>
                {busy ? <Spinner /> : <Plus size={15} />} Créer et saisir les notes
              </Button>
            </div>
          </form>
        </Card>
      )}

      {rows === null ? (
        <Spinner className="h-6 w-6 text-primary" />
      ) : rows.length === 0 ? (
        <EmptyState title="Aucune évaluation" description="Créez la première évaluation de cette matière pour ce trimestre." />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3">
              <button type="button" onClick={() => setOpen(row.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-ink">{row.titre}</p>
                <p className="text-xs text-ink-muted">
                  {row.date} · sur {row.bareme} · coefficient {row.coefficient} · {row.notes} note(s), {row.absents} absent(s), {row.dispenses} dispensé(s) sur {row.effectif}
                </p>
              </button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setOpen(row.id)}>
                  {row.periode === "OUVERT" ? "Saisir" : "Voir"}
                </Button>
                {canEnter && row.periode === "OUVERT" && (
                  <Button variant="ghost" onClick={() => remove(row)} aria-label={`Supprimer ${row.titre}`}>
                    <Trash2 size={15} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
