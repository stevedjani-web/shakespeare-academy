"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Room, TimeSlot, TimetableEntry } from "@/lib/types";
import { Button, ErrorMessage, Select } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import { describeError } from "@/components/vie-scolaire/shared";
import { CELL, TH, orderedDays, slotRows, type ViewKind } from "./shared";

interface AssignmentOption {
  subjectId: string;
  subject: { id: string; nom: string };
  teacher: { nom: string; prenom: string };
}

/**
 * Grille hebdomadaire d'une version (jours en colonnes, créneaux en lignes). En brouillon, la vue par
 * classe permet d'ajouter, modifier et retirer des séances ; les conflits sont refusés par le serveur
 * et le message qui nomme la séance en cause s'affiche tel quel.
 */
export function VersionGrid({
  timetableId,
  view,
  targetId,
  entries,
  slots,
  rooms,
  joursClasse,
  editable,
  classSlots,
  onChanged,
}: {
  timetableId: string;
  view: ViewKind;
  targetId: string;
  entries: TimetableEntry[];
  slots: TimeSlot[];
  rooms: Room[];
  joursClasse: number[];
  editable: boolean;
  /** Créneaux de la grille horaire de la classe affichée (vue par classe uniquement). */
  classSlots: TimeSlot[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const days = orderedDays(joursClasse);
  const rows = slotRows(view === "classe" ? classSlots : slots);
  const [adding, setAdding] = useState<{ timeSlotId: string; jour: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canEditHere = editable && view === "classe";

  useEffect(() => {
    if (!canEditHere || !targetId) return;
    void api
      .get<AssignmentOption[]>(`/assignments?classId=${targetId}`)
      .then(setAssignments)
      .catch(() => setAssignments([]));
  }, [canEditHere, targetId]);

  function close() {
    setAdding(null);
    setEditing(null);
    setError(null);
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      close();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const activeRooms = rooms.filter((r) => r.actif);

  function cellEntries(slotStart: string, slotEnd: string, jour: number) {
    return entries.filter((e) => e.jourSemaine === jour && e.heureDebut === slotStart && e.heureFin === slotEnd);
  }

  function slotIdFor(start: string, end: string): string | undefined {
    return classSlots.find((s) => s.heureDebut === start && s.heureFin === end)?.id;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{t("tt.grid.noSlots")}</p>;
  }

  return (
    <div>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${TH} w-24`}>{t("tt.grid.timeCol")}</th>
              {days.map((d) => (
                <th key={d.value} className={TH}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="border border-border bg-surface-muted px-2 py-1.5 align-top text-xs text-ink-muted">
                  <div className="font-medium text-ink">
                    {row.heureDebut} - {row.heureFin}
                  </div>
                  <div>{row.libelle}</div>
                </td>
                {row.type === "PAUSE" ? (
                  <td colSpan={days.length} className="border border-border bg-surface-muted px-2 py-1.5 text-center text-xs italic text-ink-muted">
                    {row.libelle}
                  </td>
                ) : (
                  days.map((d) => {
                    const here = cellEntries(row.heureDebut, row.heureFin, d.value);
                    const isAdding = adding?.timeSlotId === row.key && adding.jour === d.value;
                    return (
                      <td key={d.value} className={CELL}>
                        {here.map((e) =>
                          editing === e.id ? (
                            <div key={e.id} className="mb-1 space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-1.5">
                              <Select value={roomId} onChange={(ev) => setRoomId(ev.target.value)} aria-label={t("tt.col.room")}>
                                {activeRooms.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.nom}
                                  </option>
                                ))}
                              </Select>
                              <div className="flex gap-1">
                                <Button onClick={() => void run(() => api.patch(`/timetable-entries/${e.id}`, { roomId }))}>{t("tt.ok")}</Button>
                                <Button variant="ghost" onClick={close}>
                                  <X size={14} />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div key={e.id} className="mb-1 rounded-lg bg-primary/8 p-1.5 leading-snug">
                              <div className="font-medium text-ink">
                                {view === "classe" ? e.subject.nom : `${e.class.nom} · ${e.subject.nom}`}
                              </div>
                              <div className="text-xs text-ink-muted">
                                {view !== "enseignant" && `${e.teacher.prenom} ${e.teacher.nom}`}
                                {view === "classe" && " · "}
                                {view !== "salle" && e.room.nom}
                              </div>
                              {canEditHere && (
                                <div className="mt-1 flex gap-1">
                                  <button
                                    type="button"
                                    aria-label={t("tt.grid.changeRoom")}
                                    className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                                    onClick={() => {
                                      close();
                                      setEditing(e.id);
                                      setRoomId(e.roomId);
                                    }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("tt.grid.removeSession")}
                                    className="rounded p-1 text-danger hover:bg-danger-soft"
                                    onClick={() => void run(() => api.delete(`/timetable-entries/${e.id}`))}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                        {canEditHere && here.length === 0 && !isAdding && (
                          <button
                            type="button"
                            aria-label={t("tt.grid.addSession", { day: d.label, time: row.heureDebut })}
                            className="flex h-8 w-full items-center justify-center rounded-lg border border-dashed border-border text-ink-muted hover:border-primary hover:text-primary"
                            onClick={() => {
                              close();
                              setAdding({ timeSlotId: row.key, jour: d.value });
                              setSubjectId(assignments[0]?.subjectId ?? "");
                              setRoomId(activeRooms[0]?.id ?? "");
                            }}
                          >
                            <Plus size={15} />
                          </button>
                        )}
                        {isAdding && (
                          <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-1.5">
                            <Select value={subjectId} onChange={(ev) => setSubjectId(ev.target.value)} aria-label={t("tt.col.subject")}>
                              {assignments.length === 0 && <option value="">{t("tt.grid.noAssignment")}</option>}
                              {assignments.map((a) => (
                                <option key={a.subjectId} value={a.subjectId}>
                                  {a.subject.nom} ({a.teacher.prenom} {a.teacher.nom})
                                </option>
                              ))}
                            </Select>
                            <Select value={roomId} onChange={(ev) => setRoomId(ev.target.value)} aria-label={t("tt.col.room")}>
                              {activeRooms.length === 0 && <option value="">{t("tt.grid.noRoom")}</option>}
                              {activeRooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nom}
                                </option>
                              ))}
                            </Select>
                            <div className="flex gap-1">
                              <Button
                                disabled={!subjectId || !roomId}
                                onClick={() => {
                                  const timeSlotId = slotIdFor(row.heureDebut, row.heureFin);
                                  if (!timeSlotId) return;
                                  void run(() =>
                                    api.post(`/timetables/${timetableId}/entries`, {
                                      classId: targetId,
                                      subjectId,
                                      timeSlotId,
                                      jourSemaine: d.value,
                                      roomId,
                                    }),
                                  );
                                }}
                              >
                                {t("tt.add")}
                              </Button>
                              <Button variant="ghost" onClick={close}>
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
