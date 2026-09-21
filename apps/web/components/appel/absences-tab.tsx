"use client";

import { useCallback, useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { AbsenceReason, AbsenceRow, Class } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner, SuccessMessage } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { ExportButtons } from "@/components/export-buttons";
import { buildSection } from "@/lib/export";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatIso, shiftWeek } from "@/components/emploi-du-temps/shared";

const FILTERS = [
  ["", "Tous"],
  ["aucune", "Sans justificatif"],
  ["attente", "Justificatif à décider"],
  ["acceptee", "Excusées"],
  ["refusee", "Refusées"],
] as const;

function statusLabel(r: AbsenceRow): string {
  return r.statut === "ABSENT" ? "Absent" : `Retard${r.minutesRetard ? ` (${r.minutesRetard} min)` : ""}`;
}

function justificationLabel(r: AbsenceRow): string {
  const j = r.justification;
  if (!j) return "Aucun justificatif";
  return j.statut === "ACCEPTEE" ? "Excusée" : j.statut === "REFUSEE" ? "Refusée" : "À décider";
}

/** Absences et retards, avec justificatifs : la liste de travail de la vie scolaire. */
export function AbsencesTab({ classes }: { classes: Class[] }) {
  const { hasPermission } = useAuth();
  const canCorrect = hasPermission("ATTENDANCE_CORRECT");
  const expand = useExpanded();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(shiftWeek(today, -30));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState("");
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  const [reasons, setReasons] = useState<AbsenceReason[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ recordId: string; reasonId: string; commentaire: string } | null>(null);

  const load = useCallback(async () => {
    const query = [`from=${from}`, `to=${to}`, classId && `classId=${classId}`, filter && `justification=${filter}`]
      .filter(Boolean)
      .join("&");
    try {
      setRows(await api.get<AbsenceRow[]>(`/attendance/absences?${query}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [from, to, classId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.get<AbsenceReason[]>("/absence-reasons").then(setReasons).catch(() => setReasons([]));
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      setForm(null);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const exportSection = buildSection(
    "Absences et retards",
    [
      { header: "Date", value: (r: AbsenceRow) => formatIso(r.date) },
      { header: "Élève", value: (r) => r.eleve },
      { header: "Matricule", value: (r) => r.matricule },
      { header: "Classe", value: (r) => r.classe },
      { header: "Séance", value: (r) => `${r.heureDebut} ${r.matiere}` },
      { header: "Statut", value: (r) => statusLabel(r) },
      { header: "Justificatif", value: (r) => justificationLabel(r) },
      { header: "Motif", value: (r) => r.justification?.motif ?? r.justification?.commentaire ?? "" },
    ],
    rows ?? [],
  );

  return (
    <div>
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Du">
            <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label="Au">
            <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
          <Field label="Classe">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Justificatif">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {!rows && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </p>
      )}

      {rows && rows.length === 0 && (
        <EmptyState icon={<UserX />} title="Aucune absence ni retard." description="Rien à signaler pour ces critères." />
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <ExpandAll count={rows.length} onOpenAll={() => expand.openAll(rows.map((r) => r.recordId))} onCloseAll={expand.closeAll} />
            <ExportButtons fileName="absences" title="Absences et retards" subtitle={`Du ${formatIso(from)} au ${formatIso(to)}`} sections={[exportSection]} landscape />
          </div>
          <ul className="space-y-2">
            {rows.map((r) => {
              const open = expand.isOpen(r.recordId);
              const j = r.justification;
              return (
                <li key={r.recordId} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex items-start gap-2">
                    <ExpandButton open={open} onClick={() => expand.toggle(r.recordId)} label={`${r.eleve}, ${formatIso(r.date)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-ink">
                          {r.eleve} <span className="font-normal text-ink-muted">· {r.classe}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge color={r.statut === "ABSENT" ? "red" : "orange"}>{statusLabel(r)}</Badge>
                          <Badge color={j?.statut === "ACCEPTEE" ? "green" : j?.statut === "REFUSEE" ? "red" : j ? "blue" : "gray"}>
                            {justificationLabel(r)}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-ink-muted">
                        {formatIso(r.date)} · {r.heureDebut} - {r.heureFin} · {r.matiere}
                      </p>

                      {open && (
                        <div className="mt-3 space-y-3 text-sm">
                          <p className="text-ink-muted">
                            Matricule {r.matricule} · Enseignant : {r.enseignant}
                          </p>
                          {j && (
                            <p className="text-ink">
                              Justificatif : {j.motif ?? "sans motif"}
                              {j.commentaire ? `, « ${j.commentaire} »` : ""}
                              {j.horsDelai ? " (déposé hors délai)" : ""}
                              {j.decision ? ` · Décision : ${j.decision}` : ""}
                            </p>
                          )}
                          {r.corrections.length > 0 && (
                            <ul className="rounded-xl bg-surface-muted p-2.5 text-xs text-ink-muted">
                              {r.corrections.map((c, i) => (
                                <li key={i}>
                                  {formatIso(c.date.slice(0, 10))} · {c.par} : {c.de} vers {c.vers}, « {c.motif} »
                                </li>
                              ))}
                            </ul>
                          )}

                          {canCorrect && !j && form?.recordId !== r.recordId && (
                            <Button variant="secondary" onClick={() => setForm({ recordId: r.recordId, reasonId: "", commentaire: "" })}>
                              Ajouter un justificatif
                            </Button>
                          )}
                          {canCorrect && form?.recordId === r.recordId && (
                            <div className="space-y-2 rounded-xl bg-surface-muted p-3">
                              <Field label="Motif">
                                <Select value={form.reasonId} onChange={(e) => setForm({ ...form, reasonId: e.target.value })}>
                                  <option value="">Aucun motif de la liste</option>
                                  {reasons
                                    .filter((x) => x.actif)
                                    .map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.libelle}
                                      </option>
                                    ))}
                                </Select>
                              </Field>
                              <Field label="Commentaire">
                                <Input value={form.commentaire} onChange={(e) => setForm({ ...form, commentaire: e.target.value })} />
                              </Field>
                              <div className="flex gap-2">
                                <Button
                                  disabled={!form.reasonId && !form.commentaire.trim()}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        api.post(`/attendance/records/${r.recordId}/justification`, {
                                          reasonId: form.reasonId || undefined,
                                          commentaire: form.commentaire || undefined,
                                        }),
                                      "Justificatif enregistré.",
                                    )
                                  }
                                >
                                  Enregistrer
                                </Button>
                                <Button variant="ghost" onClick={() => setForm(null)}>
                                  Annuler
                                </Button>
                              </div>
                            </div>
                          )}
                          {canCorrect && j?.statut === "EN_ATTENTE" && (
                            <div className="flex gap-2">
                              <Button onClick={() => void run(() => api.patch(`/attendance/justifications/${j.id}`, { statut: "ACCEPTEE" }), "Justificatif accepté.")}>
                                Accepter
                              </Button>
                              <Button variant="danger" onClick={() => void run(() => api.patch(`/attendance/justifications/${j.id}`, { statut: "REFUSEE" }), "Justificatif refusé.")}>
                                Refuser
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
