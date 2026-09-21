"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, CloudOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { listOutbox, useOnOutboxChange } from "@/lib/outbox";
import type { AttendanceDay, Class } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { shiftWeek } from "@/components/emploi-du-temps/shared";

/** Séances d'un jour, avec l'état de leur appel. Un clic ouvre la feuille d'appel. */
export function DayTab({ classes, onOpen }: { classes: Class[]; onOpen: (entryId: string, date: string) => void }) {
  const { user, hasPermission } = useAuth();
  const canTake = hasPermission("ATTENDANCE_TAKE");
  const [date, setDate] = useState<string | null>(null);
  const [classId, setClassId] = useState("");
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!date) return;
    try {
      setDay(await api.get<AttendanceDay>(`/attendance/day?date=${date}${classId ? `&classId=${classId}` : ""}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
    // Les appels faits sur cet appareil et pas encore envoyés.
    const entries = await listOutbox();
    setWaiting(
      new Set(
        entries
          .filter((e) => e.kind === "attendance" && e.status === "pending" && e.userId === user?.id)
          .map((e) => e.body as { entryId?: string; date?: string })
          .filter((b) => b.date === date)
          .map((b) => b.entryId ?? ""),
      ),
    );
  }, [date, classId, user?.id]);

  // La date de départ est « aujourd'hui » vu par le serveur (fuseau de l'établissement).
  useEffect(() => {
    if (date) return;
    void api
      .get<AttendanceDay>(`/attendance/day?date=${new Date().toISOString().slice(0, 10)}`)
      .then((d) => setDate(d.aujourdhui))
      .catch(() => setDate(new Date().toISOString().slice(0, 10)));
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);
  useOnOutboxChange(() => void load());

  const sorted = useMemo(
    () => [...(day?.seances ?? [])].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut) || a.className.localeCompare(b.className, "fr")),
    [day],
  );

  return (
    <div>
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <Field label="Jour">
            <div className="flex items-center gap-2">
              <Button variant="secondary" aria-label="Jour précédent" onClick={() => date && setDate(shiftWeek(date, -1))}>
                <ChevronLeft size={16} />
              </Button>
              <Input type="date" value={date ?? ""} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
              <Button variant="secondary" aria-label="Jour suivant" onClick={() => date && setDate(shiftWeek(date, 1))}>
                <ChevronRight size={16} />
              </Button>
              {day && date !== day.aujourdhui && (
                <Button variant="ghost" onClick={() => setDate(day.aujourdhui)}>
                  Aujourd&apos;hui
                </Button>
              )}
            </div>
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
        </div>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {!day && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </p>
      )}

      {day?.futur && <p className="mb-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink-muted">Ce jour n&apos;a pas encore eu lieu : l&apos;appel n&apos;est pas possible.</p>}
      {day?.sansClasse && (
        <p className="mb-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink-muted">Pas de cours ce jour : {day.sansClasse.libelle}.</p>
      )}

      {day && !day.sansClasse && sorted.length === 0 && (
        <EmptyState
          icon={<CalendarCheck />}
          title="Aucune séance ce jour."
          description="L'emploi du temps en vigueur ne prévoit pas de cours ce jour-là pour ce choix."
        />
      )}

      <ul className="space-y-2">
        {sorted.map((s) => {
          const cancelled = s.statut === "ANNULEE";
          const queued = waiting.has(s.entryId);
          return (
            <li key={s.entryId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-medium text-ink ${cancelled ? "line-through" : ""}`}>
                      {s.heureDebut} - {s.heureFin} · {s.className} · {s.subjectName}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {s.teacherName} · {s.roomName}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cancelled && <Badge color="red">Annulée</Badge>}
                      {s.statut === "REMPLACEE" && <Badge color="orange">Remplaçant</Badge>}
                      {!cancelled && s.appel && (
                        <Badge color="green">
                          Fait par {s.appel.par} · {s.appel.absents} absent(s), {s.appel.retards} retard(s)
                        </Badge>
                      )}
                      {!cancelled && !s.appel && !queued && !day?.futur && <Badge color="gray">À faire</Badge>}
                      {queued && (
                        <Badge color="orange">
                          <CloudOff size={12} /> En attente d&apos;envoi
                        </Badge>
                      )}
                    </div>
                  </div>
                  {!cancelled && !day?.futur && date && (
                    <Button variant={s.appel || queued ? "secondary" : "primary"} onClick={() => onOpen(s.entryId, date)}>
                      {s.appel || queued ? (canTake ? "Ouvrir / corriger" : "Voir") : canTake ? "Faire l'appel" : "Voir"}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
