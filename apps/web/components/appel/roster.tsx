"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CloudOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { listOutbox, useOnOutboxChange } from "@/lib/outbox";
import type { AttendanceSheet, SheetStudent } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatIso } from "@/components/emploi-du-temps/shared";

type Mode = "PRESENT" | "RETARD" | "ABSENT";
type Mark = { mode: Mode; minutes: string };
type SavedItem = { studentId: string; absent?: boolean; minutesRetard?: number };

/** Ce que le serveur a enregistré, ramené à un choix de l'écran (un « absent » par dépassement du seuil reste un retard chiffré). */
function markFromStudent(s: SheetStudent): Mark {
  if (s.minutesRetard) return { mode: "RETARD", minutes: String(s.minutesRetard) };
  if (s.statut === "ABSENT") return { mode: "ABSENT", minutes: "" };
  return { mode: "PRESENT", minutes: "" };
}

const MODE_STYLE: Record<Mode, string> = {
  PRESENT: "bg-success text-white",
  RETARD: "bg-warning text-white",
  ABSENT: "bg-danger text-white",
};
const MODE_LABEL: Record<Mode, string> = { PRESENT: "Présent", RETARD: "Retard", ABSENT: "Absent" };

/**
 * Feuille d'appel d'une séance : tout le monde présent par défaut, on ne touche que les exceptions
 * (D60). Sans Internet, l'appel est gardé sur l'appareil et envoyé au retour du réseau.
 */
export function Roster({ entryId, date, onBack }: { entryId: string; date: string; onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const canTake = hasPermission("ATTENDANCE_TAKE");
  const canCorrect = hasPermission("ATTENDANCE_CORRECT");
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; queued: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<AttendanceSheet>(`/attendance/sheet?entryId=${entryId}&date=${date}`);
      // Un appel encore en attente d'envoi sur cet appareil prime sur ce que le serveur connaît.
      const waiting = (await listOutbox())
        .filter((e) => e.kind === "attendance" && e.status === "pending" && e.userId === user?.id)
        .map((e) => e.body as { entryId?: string; date?: string; absences?: SavedItem[] })
        .filter((b) => b.entryId === entryId && b.date === date)
        .pop();
      const next: Record<string, Mark> = {};
      for (const s of data.eleves) next[s.studentId] = markFromStudent(s);
      if (waiting?.absences) {
        for (const s of data.eleves) next[s.studentId] = { mode: "PRESENT", minutes: "" };
        for (const item of waiting.absences) {
          next[item.studentId] = item.absent
            ? { mode: "ABSENT", minutes: "" }
            : { mode: "RETARD", minutes: String(item.minutesRetard ?? "") };
        }
      }
      setPending(Boolean(waiting));
      setSheet(data);
      setMarks(next);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [entryId, date, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);
  useOnOutboxChange(() => void load());

  const students = sheet?.eleves ?? [];
  const seuil = sheet?.parametres.retardMaxMinutes ?? 0;
  const counts = useMemo(() => {
    const list = Object.values(marks);
    // Au-delà du seuil, un retard est compté absent (même règle que le serveur, RV05).
    const overdue = (m: Mark) => m.mode === "RETARD" && Number(m.minutes) > (sheet?.parametres.retardMaxMinutes ?? Infinity);
    return {
      absents: list.filter((m) => m.mode === "ABSENT" || overdue(m)).length,
      retards: list.filter((m) => m.mode === "RETARD" && !overdue(m)).length,
    };
  }, [marks, sheet]);

  if (!sheet) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Retour
        </Button>
        <ErrorMessage>{error}</ErrorMessage>
        {!error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
            <Spinner /> Chargement de la feuille d&apos;appel…
          </p>
        )}
      </div>
    );
  }

  const seance = sheet.seance;
  const author = !sheet.appel || sheet.appel.par.id === user?.id;
  const needsCorrection = Boolean(sheet.appel && !author) || sheet.verrouille;
  const cancelled = seance.statut === "ANNULEE";
  const editable = canTake && !cancelled && (!needsCorrection || canCorrect);
  const motifRequired = needsCorrection && editable;

  let readOnlyReason: string | null = null;
  if (cancelled) readOnlyReason = "Cette séance est annulée : il n'y a pas d'appel à faire.";
  else if (!canTake) readOnlyReason = "Vous pouvez consulter cet appel mais pas le modifier.";
  else if (sheet.appel && !author && !canCorrect) readOnlyReason = `Cet appel a déjà été fait par ${sheet.appel.par.nom}.`;
  else if (sheet.verrouille && !canCorrect)
    readOnlyReason = sheet.appel
      ? "Cet appel est verrouillé depuis la fin de la journée : la correction revient à la vie scolaire ou à la Direction."
      : "Le jour de cette séance est passé : l'appel doit être saisi par la vie scolaire ou la Direction.";

  function setMode(id: string, mode: Mode) {
    setMarks((m) => ({ ...m, [id]: { mode, minutes: mode === "RETARD" ? m[id]?.minutes ?? "" : "" } }));
  }

  const missingMinutes = Object.values(marks).some(
    (m) => m.mode === "RETARD" && !(Number.isInteger(Number(m.minutes)) && Number(m.minutes) >= 1),
  );

  async function save() {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const absences: SavedItem[] = students
      .filter((s) => marks[s.studentId]?.mode !== "PRESENT")
      .map((s) => {
        const m = marks[s.studentId];
        return m.mode === "ABSENT" ? { studentId: s.studentId, absent: true } : { studentId: s.studentId, minutesRetard: Number(m.minutes) };
      });
    const body = { entryId, date, absences, ...(motifRequired ? { motif: motif.trim() } : {}) };
    try {
      const result = await submitOrQueue<AttendanceSheet>(
        {
          kind: "attendance",
          method: "POST",
          path: "/attendance/calls",
          body,
          label: `${seance.className}, ${seance.subjectName}, ${formatIso(date)}`,
        },
        // L'heure de saisie sur l'appareil accompagne l'appel envoyé plus tard : c'est elle qui prouve
        // qu'il a été fait le jour même, même s'il n'arrive qu'après le verrouillage.
        () => ({ body: { ...body, saisiLe: new Date().toISOString() } }),
      );
      if (result.queued) {
        setPending(true);
        setNotice({ text: "Appel gardé sur cet appareil : il partira dès que la connexion reviendra.", queued: true });
      } else {
        setSheet(result.result);
        const next: Record<string, Mark> = {};
        for (const s of result.result.eleves) next[s.studentId] = markFromStudent(s);
        setMarks(next);
        setPending(false);
        setMotif("");
        setNotice({ text: "Appel enregistré.", queued: false });
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="ghost" onClick={onBack} className="mb-3">
        <ArrowLeft size={16} /> Retour aux séances
      </Button>

      <Card className="mb-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          {seance.className}, {seance.subjectName}
        </h2>
        <p className="text-sm text-ink-muted">
          {formatIso(date)} · {seance.heureDebut} - {seance.heureFin} · {seance.teacherName} · {seance.roomName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {seance.statut === "REMPLACEE" && <Badge color="orange">Enseignant remplaçant</Badge>}
          {sheet.appel ? (
            <Badge color="green">
              Appel fait par {sheet.appel.par.nom}
              {sheet.appel.horsLigne ? " (hors ligne)" : ""}
            </Badge>
          ) : (
            <Badge color="gray">Appel à faire</Badge>
          )}
          {sheet.verrouille && <Badge color="gray">Verrouillé</Badge>}
          {pending && (
            <Badge color="orange">
              <CloudOff size={12} /> En attente d&apos;envoi
            </Badge>
          )}
        </div>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && (
        <div className="mb-3">
          {notice.queued ? (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
              <CloudOff size={16} className="mt-0.5 shrink-0" />
              {notice.text}
            </p>
          ) : (
            <SuccessMessage>{notice.text}</SuccessMessage>
          )}
        </div>
      )}
      {readOnlyReason && <p className="mb-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink-muted">{readOnlyReason}</p>}

      <div className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface/95 px-1 py-2 backdrop-blur">
        <p className="text-sm text-ink">
          <strong>{students.length}</strong> élève(s) · <span className="text-danger">{counts.absents} absent(s)</span> ·{" "}
          <span className="text-warning">{counts.retards} en retard</span>
        </p>
        {editable && (
          <Button
            variant="secondary"
            onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, { mode: "PRESENT" as Mode, minutes: "" }])))}
          >
            Tout présent
          </Button>
        )}
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucun élève inscrit dans cette classe.</p>
      ) : (
        <ul className="space-y-2">
          {students.map((s) => {
            const mark = marks[s.studentId] ?? { mode: "PRESENT" as Mode, minutes: "" };
            const minutes = Number(mark.minutes);
            return (
              <li key={s.studentId} className="rounded-xl border border-border bg-surface p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {s.nom} {s.prenom}
                    </p>
                    <p className="text-xs text-ink-muted">{s.matricule}</p>
                  </div>
                  <div className="flex gap-1" role="group" aria-label={`Statut de ${s.prenom} ${s.nom}`}>
                    {(["PRESENT", "RETARD", "ABSENT"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={!editable}
                        aria-pressed={mark.mode === m}
                        onClick={() => setMode(s.studentId, m)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          mark.mode === m ? MODE_STYLE[m] : "border border-border text-ink-muted hover:bg-surface-muted"
                        } disabled:cursor-not-allowed`}
                      >
                        {MODE_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>
                {mark.mode === "RETARD" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <label className="text-ink-muted" htmlFor={`min-${s.studentId}`}>
                      Minutes de retard
                    </label>
                    <Input
                      id={`min-${s.studentId}`}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      disabled={!editable}
                      value={mark.minutes}
                      onChange={(e) => setMarks((m) => ({ ...m, [s.studentId]: { mode: "RETARD", minutes: e.target.value } }))}
                      className="!w-24"
                    />
                    {minutes > seuil && <span className="text-danger">Au-delà de {seuil} min : compté absent</span>}
                  </div>
                )}
                {s.justification && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Justificatif :{" "}
                    {s.justification.statut === "ACCEPTEE" ? "accepté" : s.justification.statut === "REFUSEE" ? "refusé" : "en attente"}
                    {s.justification.motif ? ` (${s.justification.motif})` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-surface p-3">
          {motifRequired && (
            <Field label="Motif de la correction (obligatoire)">
              <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. erreur de saisie, arrivé avec un mot des parents" />
            </Field>
          )}
          {missingMinutes && <p className="text-sm text-danger">Indiquez les minutes de retard, ou choisissez Absent.</p>}
          <Button onClick={() => void save()} disabled={busy || missingMinutes || (motifRequired && !motif.trim())}>
            {busy ? <Spinner /> : <CheckCircle2 size={16} />} {motifRequired ? "Enregistrer la correction" : "Enregistrer l'appel"}
          </Button>
        </div>
      )}
    </div>
  );
}
