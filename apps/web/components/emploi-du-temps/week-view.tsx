"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Occurrence, OccurrenceStatus, Room, Teacher, TimetableWeek } from "@/lib/types";
import { Badge, Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { describeError, WEEK_DAYS } from "@/components/vie-scolaire/shared";
import { formatIso } from "./shared";

const STATUS_BADGE: Record<OccurrenceStatus, { label: string; color: "gray" | "red" | "orange" | "blue" | "green" }> = {
  NORMALE: { label: "Normale", color: "gray" },
  ANNULEE: { label: "Annulée", color: "red" },
  REMPLACEE: { label: "Remplacée", color: "orange" },
  SALLE_MODIFIEE: { label: "Salle changée", color: "blue" },
};

type ExceptionType = "ANNULEE" | "REMPLACEE" | "SALLE_MODIFIEE";

/**
 * Semaine réelle : la version en vigueur ce jour-là, plus les changements ponctuels. Annuler, remplacer
 * un enseignant ou changer de salle n'altère jamais la version publiée : ce sont des exceptions datées.
 */
export function WeekView({
  week,
  canManage,
  teachers,
  rooms,
  onChanged,
}: {
  week: TimetableWeek;
  canManage: boolean;
  teachers: Teacher[];
  rooms: Room[];
  onChanged: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [type, setType] = useState<ExceptionType>("ANNULEE");
  const [motif, setMotif] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeTeachers = teachers.filter((t) => t.statut === "ACTIF");
  const activeRooms = rooms.filter((r) => r.actif);

  function open(key: string, s: Occurrence) {
    setOpenKey(key);
    setType("ANNULEE");
    setMotif("");
    setTeacherId(activeTeachers.find((t) => t.id !== s.teacherId)?.id ?? "");
    setRoomId(activeRooms.find((r) => r.id !== s.roomId)?.id ?? "");
    setError(null);
  }

  async function submit(s: Occurrence) {
    setError(null);
    try {
      await api.post(`/timetable-entries/${s.entryId}/exceptions`, {
        date: s.date,
        type,
        motif,
        replacementTeacherId: type === "REMPLACEE" ? teacherId : undefined,
        roomId: type === "SALLE_MODIFIEE" ? roomId : undefined,
      });
      setOpenKey(null);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function restore(id: string) {
    setError(null);
    try {
      await api.delete(`/timetable-exceptions/${id}`);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="space-y-3">
      {week.jours.map((day) => {
        const label = WEEK_DAYS.find((d) => d.value === new Date(`${day.date}T00:00:00Z`).getUTCDay())?.label ?? "";
        return (
          <section key={day.date} className="rounded-2xl border border-border bg-surface p-3">
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">
                {label} {formatIso(day.date)}
              </h3>
              {day.version && <span className="text-xs text-ink-muted">Version {day.version.numero}</span>}
              {day.sansClasse && <Badge color="gray">{day.sansClasse.libelle}</Badge>}
            </header>

            {day.seances.length === 0 ? (
              <p className="text-sm text-ink-muted">{day.sansClasse ? "Pas de cours ce jour." : "Aucune séance."}</p>
            ) : (
              <ul className="space-y-2">
                {day.seances.map((s) => {
                  const key = `${s.entryId}-${s.date}`;
                  const status = STATUS_BADGE[s.statut];
                  return (
                    <li key={key} className={`rounded-xl border border-border p-2.5 ${s.statut === "ANNULEE" ? "opacity-70" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`font-medium text-ink ${s.statut === "ANNULEE" ? "line-through" : ""}`}>
                            {s.heureDebut} - {s.heureFin} · {s.className} · {s.subjectName}
                          </div>
                          <div className="text-sm text-ink-muted">
                            {s.teacherName} · {s.roomName}
                          </div>
                          {s.exception && (
                            <div className="mt-1 text-xs text-ink-muted">
                              {s.statut === "REMPLACEE" && `Enseignant habituel : ${s.exception.enseignantInitial}. `}
                              {s.statut === "SALLE_MODIFIEE" && `Salle habituelle : ${s.exception.salleInitiale}. `}
                              Motif : {s.exception.motif}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {s.statut !== "NORMALE" && <Badge color={status.color}>{status.label}</Badge>}
                          {canManage && s.exception && (
                            <Button variant="ghost" onClick={() => void restore(s.exception!.id)}>
                              <Undo2 size={14} /> Rétablir
                            </Button>
                          )}
                          {canManage && !s.exception && openKey !== key && (
                            <Button variant="secondary" onClick={() => open(key, s)}>
                              Changement ponctuel
                            </Button>
                          )}
                        </div>
                      </div>

                      {openKey === key && (
                        <div className="mt-2 space-y-2 rounded-xl bg-surface-muted p-2.5">
                          <ErrorMessage>{error}</ErrorMessage>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="Type">
                              <Select value={type} onChange={(e) => setType(e.target.value as ExceptionType)}>
                                <option value="ANNULEE">Annuler la séance</option>
                                <option value="REMPLACEE">Remplacer l&apos;enseignant</option>
                                <option value="SALLE_MODIFIEE">Changer de salle</option>
                              </Select>
                            </Field>
                            {type === "REMPLACEE" && (
                              <Field label="Remplaçant">
                                <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                                  {activeTeachers
                                    .filter((t) => t.id !== s.teacherId)
                                    .map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.prenom} {t.nom}
                                      </option>
                                    ))}
                                </Select>
                              </Field>
                            )}
                            {type === "SALLE_MODIFIEE" && (
                              <Field label="Nouvelle salle">
                                <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                                  {activeRooms
                                    .filter((r) => r.id !== s.roomId)
                                    .map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.nom}
                                      </option>
                                    ))}
                                </Select>
                              </Field>
                            )}
                            <Field label="Motif (obligatoire)">
                              <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. enseignant absent" />
                            </Field>
                          </div>
                          <div className="flex gap-2">
                            <Button disabled={!motif.trim()} onClick={() => void submit(s)}>
                              Enregistrer
                            </Button>
                            <Button variant="ghost" onClick={() => setOpenKey(null)}>
                              Annuler
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {!openKey && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
