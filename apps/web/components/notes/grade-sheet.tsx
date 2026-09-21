"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CloudOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { formatNote, parseNote, type GradeSheet, type NoteStatus } from "@/lib/grades";
import { Badge, Button, Card, ErrorMessage, Field, Input, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

type Mode = NoteStatus | "AUCUNE";
type Cell = { mode: Mode; text: string };
type Item = { studentId: string; statut: Mode; valeur?: number };

function cellFrom(row: GradeSheet["eleves"][number]): Cell {
  if (row.statut === "NOTE") return { mode: "NOTE", text: String(row.valeur ?? "").replace(".", ",") };
  return { mode: row.statut ?? "AUCUNE", text: "" };
}

/**
 * Feuille de notes d'une évaluation : on saisit la note de chaque élève, ou « absent » / « dispensé » (un absent n'est
 * jamais compté 0). L'enregistrement remplace la feuille en une fois : sans Internet, il est gardé sur l'appareil et
 * envoyé au retour du réseau, sans jamais créer de doublon.
 */
export function GradeSheetView({ evaluationId, onBack }: { evaluationId: string; onBack: () => void }) {
  const { hasPermission } = useAuth();
  const canEnter = hasPermission("GRADE_ENTER");
  const canCorrect = hasPermission("GRADE_CORRECT");
  const [sheet, setSheet] = useState<GradeSheet | null>(null);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [initial, setInitial] = useState<Record<string, Cell>>({});
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; queued: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<GradeSheet>(`/grades/evaluations/${evaluationId}/sheet`);
      setSheet(data);
      const next = Object.fromEntries(data.eleves.map((e) => [e.studentId, cellFrom(e)]));
      setCells(next);
      setInitial(next);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [evaluationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = sheet?.verrouille ?? false;
  const editable = sheet ? (locked ? canCorrect : canEnter) : false;

  const invalid = useMemo(() => {
    if (!sheet) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [id, cell] of Object.entries(cells)) {
      if (cell.mode !== "NOTE") continue;
      const n = parseNote(cell.text);
      if (n === null) out[id] = "Saisissez un nombre.";
      else if (n < 0 || n > sheet.evaluation.bareme) out[id] = `Entre 0 et ${sheet.evaluation.bareme}.`;
      else if (Math.round(n * 100) / 100 !== n) out[id] = "Deux décimales au plus.";
    }
    return out;
  }, [cells, sheet]);

  const changed = useMemo(
    () =>
      Object.keys(cells).filter((id) => {
        const a = cells[id];
        const b = initial[id];
        return a.mode !== b.mode || (a.mode === "NOTE" && a.text.trim() !== b.text.trim());
      }),
    [cells, initial],
  );

  const stats = useMemo(() => {
    if (!sheet) return { saisies: 0, moyenne: null as number | null };
    const values = Object.values(cells)
      .filter((c) => c.mode === "NOTE")
      .map((c) => parseNote(c.text))
      .filter((n): n is number => n !== null);
    const saisies = Object.values(cells).filter((c) => c.mode !== "AUCUNE").length;
    if (values.length === 0) return { saisies, moyenne: null };
    const onTwenty = values.map((v) => (v / sheet.evaluation.bareme) * 20);
    return { saisies, moyenne: onTwenty.reduce((a, b) => a + b, 0) / onTwenty.length };
  }, [cells, sheet]);

  function setMode(id: string, mode: Mode) {
    setCells((c) => ({ ...c, [id]: { mode, text: mode === "NOTE" ? c[id].text : "" } }));
    setNotice(null);
  }

  function setText(id: string, text: string) {
    // Taper un nombre fait de la ligne une note ; vider le champ la remet à « sans note ».
    setCells((c) => ({ ...c, [id]: { mode: text.trim() === "" ? "AUCUNE" : "NOTE", text } }));
    setNotice(null);
  }

  async function save() {
    if (!sheet || changed.length === 0) return;
    if (locked && !motif.trim()) {
      setError("Une correction exige un motif.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const notes: Item[] = changed.map((id) => {
        const c = cells[id];
        return c.mode === "NOTE"
          ? { studentId: id, statut: "NOTE", valeur: parseNote(c.text) as number }
          : { studentId: id, statut: c.mode };
      });
      const res = await submitOrQueue<GradeSheet>({
        kind: "grades",
        method: "POST",
        path: `/grades/evaluations/${evaluationId}/notes`,
        body: { notes, ...(locked ? { motif: motif.trim() } : {}) },
        label: `Notes : ${sheet.evaluation.titre} (${sheet.evaluation.className})`,
      });
      if (res.queued) {
        setInitial(cells);
        setNotice({ text: "Enregistré sur cet appareil. Les notes seront envoyées dès le retour d'Internet.", queued: true });
      } else {
        setSheet(res.result);
        const next = Object.fromEntries(res.result.eleves.map((e) => [e.studentId, cellFrom(e)]));
        setCells(next);
        setInitial(next);
        setMotif("");
        setNotice({ text: "Notes enregistrées.", queued: false });
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!sheet) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={15} /> Retour
        </Button>
        {error ? <ErrorMessage>{error}</ErrorMessage> : <Spinner className="mt-6 h-6 w-6 text-primary" />}
      </div>
    );
  }

  const ev = sheet.evaluation;
  return (
    <div>
      <Button variant="ghost" onClick={onBack} className="mb-3">
        <ArrowLeft size={15} /> Retour aux évaluations
      </Button>
      <Card className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {ev.titre} · {ev.subjectName}
            </h2>
            <p className="text-sm text-ink-muted">
              {ev.className} · {ev.trimestre} · {ev.date} · sur {ev.bareme} · coefficient {ev.coefficient}
            </p>
          </div>
          {locked && <Badge color="orange">Trimestre validé</Badge>}
        </div>
        {locked && !canCorrect && (
          <p className="mt-2 text-sm text-ink-muted">
            Ce trimestre est validé : seule la Direction peut corriger une note. Elle peut aussi rouvrir le trimestre.
          </p>
        )}
      </Card>

      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface/95 px-4 py-2.5 text-sm backdrop-blur">
        <span className="text-ink-muted">
          {stats.saisies} / {sheet.eleves.length} saisie(s) · moyenne du devoir <strong className="text-ink">{formatNote(stats.moyenne)}</strong> / 20
        </span>
        {editable && (
          <Button onClick={save} disabled={busy || changed.length === 0 || Object.keys(invalid).length > 0}>
            {busy && <Spinner />} Enregistrer{changed.length > 0 ? ` (${changed.length})` : ""}
          </Button>
        )}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && (
        <div className="mb-3">
          {notice.queued ? (
            <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">
              <CloudOff size={15} /> {notice.text}
            </p>
          ) : (
            <SuccessMessage>
              <CheckCircle2 size={15} className="mr-1 inline" />
              {notice.text}
            </SuccessMessage>
          )}
        </div>
      )}

      {locked && canCorrect && (
        <Card className="mb-3">
          <Field label="Motif de la correction (obligatoire)">
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. erreur de report de la note" maxLength={500} />
          </Field>
        </Card>
      )}

      <ul className="space-y-2">
        {sheet.eleves.map((row) => {
          const cell = cells[row.studentId] ?? { mode: "AUCUNE", text: "" };
          const problem = invalid[row.studentId];
          return (
            <li key={row.studentId} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {row.nom} {row.prenom}
                  </p>
                  <p className="text-xs text-ink-muted">{row.matricule}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-24">
                    <Input
                      inputMode="decimal"
                      aria-label={`Note de ${row.prenom} ${row.nom}`}
                      placeholder={`/ ${ev.bareme}`}
                      value={cell.mode === "NOTE" ? cell.text : ""}
                      disabled={!editable || cell.mode === "ABSENT" || cell.mode === "DISPENSE"}
                      onChange={(e) => setText(row.studentId, e.target.value)}
                    />
                  </div>
                  {(["ABSENT", "DISPENSE"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={!editable}
                      onClick={() => setMode(row.studentId, cell.mode === mode ? "AUCUNE" : mode)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        cell.mode === mode ? "bg-danger text-white" : "border border-border text-ink-muted hover:text-ink"
                      }`}
                    >
                      {mode === "ABSENT" ? "Absent" : "Dispensé"}
                    </button>
                  ))}
                </div>
              </div>
              {problem && <p className="mt-1 text-xs text-danger">{problem}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
