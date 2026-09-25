"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Occurrence, OccurrenceStatus, Room, Teacher, TimetableWeek } from "@/lib/types";
import { Badge, Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { weekdayName } from "@/lib/format";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatIso } from "./shared";

const STATUS_BADGE: Record<OccurrenceStatus, { key: MessageKey; color: "gray" | "red" | "orange" | "blue" | "green" }> = {
  NORMALE: { key: "tt.occ.NORMALE", color: "gray" },
  ANNULEE: { key: "tt.occ.ANNULEE", color: "red" },
  REMPLACEE: { key: "tt.occ.REMPLACEE", color: "orange" },
  SALLE_MODIFIEE: { key: "tt.occ.SALLE_MODIFIEE", color: "blue" },
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
  const { t, locale } = useI18n();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [type, setType] = useState<ExceptionType>("ANNULEE");
  const [motif, setMotif] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeTeachers = teachers.filter((x) => x.statut === "ACTIF");
  const activeRooms = rooms.filter((r) => r.actif);

  function open(key: string, s: Occurrence) {
    setOpenKey(key);
    setType("ANNULEE");
    setMotif("");
    setTeacherId(activeTeachers.find((x) => x.id !== s.teacherId)?.id ?? "");
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
        const label = weekdayName(day.date, locale);
        return (
          <section key={day.date} className="rounded-2xl border border-border bg-surface p-3">
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">
                {label} {formatIso(day.date)}
              </h3>
              {day.version && <span className="text-xs text-ink-muted">{t("tt.week.version", { n: day.version.numero })}</span>}
              {day.sansClasse && <Badge color="gray">{day.sansClasse.libelle}</Badge>}
            </header>

            {day.seances.length === 0 ? (
              <p className="text-sm text-ink-muted">{day.sansClasse ? t("tt.week.noClass") : t("tt.week.noSession")}</p>
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
                              {s.statut === "REMPLACEE" && `${t("tt.week.usualTeacher", { name: s.exception.enseignantInitial ?? "" })} `}
                              {s.statut === "SALLE_MODIFIEE" && `${t("tt.week.usualRoom", { name: s.exception.salleInitiale ?? "" })} `}
                              {t("tt.reasonLine", { reason: s.exception.motif })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {s.statut !== "NORMALE" && <Badge color={status.color}>{t(status.key)}</Badge>}
                          {canManage && s.exception && (
                            <Button variant="ghost" onClick={() => void restore(s.exception!.id)}>
                              <Undo2 size={14} /> {t("tt.week.restore")}
                            </Button>
                          )}
                          {canManage && !s.exception && openKey !== key && (
                            <Button variant="secondary" onClick={() => open(key, s)}>
                              {t("tt.week.oneOff")}
                            </Button>
                          )}
                        </div>
                      </div>

                      {openKey === key && (
                        <div className="mt-2 space-y-2 rounded-xl bg-surface-muted p-2.5">
                          <ErrorMessage>{error}</ErrorMessage>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label={t("tt.week.type")}>
                              <Select value={type} onChange={(e) => setType(e.target.value as ExceptionType)}>
                                <option value="ANNULEE">{t("tt.week.type.ANNULEE")}</option>
                                <option value="REMPLACEE">{t("tt.week.type.REMPLACEE")}</option>
                                <option value="SALLE_MODIFIEE">{t("tt.week.type.SALLE_MODIFIEE")}</option>
                              </Select>
                            </Field>
                            {type === "REMPLACEE" && (
                              <Field label={t("tt.week.replacement")}>
                                <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                                  {activeTeachers
                                    .filter((x) => x.id !== s.teacherId)
                                    .map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.prenom} {x.nom}
                                      </option>
                                    ))}
                                </Select>
                              </Field>
                            )}
                            {type === "SALLE_MODIFIEE" && (
                              <Field label={t("tt.week.newRoom")}>
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
                            <Field label={t("tt.reasonRequired")}>
                              <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("tt.week.reasonPlaceholder")} />
                            </Field>
                          </div>
                          <div className="flex gap-2">
                            <Button disabled={!motif.trim()} onClick={() => void submit(s)}>
                              {t("tt.save")}
                            </Button>
                            <Button variant="ghost" onClick={() => setOpenKey(null)}>
                              {t("tt.cancel")}
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
