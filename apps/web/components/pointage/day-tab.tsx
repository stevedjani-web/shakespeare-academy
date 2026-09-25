"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { CheckinDay, DayCheckin, SessionCheckin } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";
import { describeError } from "@/components/vie-scolaire/shared";
import { shiftWeek } from "@/components/emploi-du-temps/shared";
import { STATUS_BADGE, todayLocal } from "./shared";

type Form =
  | { kind: "reject"; id: string; entity: "sessions" | "days"; motif: string }
  | { kind: "session"; entryId: string; debut: string; fin: string; motif: string }
  | { kind: "day"; teacherId: string; arrivee: string; depart: string; motif: string };

/**
 * Pointages d'un jour : ce que les enseignants ont scanné, ce qui manque, et le travail du validateur
 * (valider, rejeter, saisir ou corriger avec un motif). Personne ne valide son propre pointage (RV06).
 */
export function PointageDayTab() {
  const { hasPermission } = useAuth();
  const { t, locale } = useI18n();
  const canValidate = hasPermission("TEACHER_CHECKIN_VALIDATE");
  const [date, setDate] = useState(todayLocal());
  const [data, setData] = useState<CheckinDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<CheckinDay>(`/teacher-checkins/day?date=${date}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const decide = (entity: "sessions" | "days", id: string, statut: "VALIDE" | "REJETE", motif?: string) =>
    run(
      () => api.post(`/teacher-checkins/${entity}/${id}/decision`, { statut, motif }),
      statut === "VALIDE" ? t("tt.ckd.validated") : t("tt.ckd.rejected"),
    );

  function actions(id: string, entity: "sessions" | "days", statut: string) {
    if (!canValidate || statut !== "EN_ATTENTE") return null;
    return (
      <>
        <Button onClick={() => void decide(entity, id, "VALIDE")}>{t("tt.ckd.validate")}</Button>
        <Button variant="danger" onClick={() => setForm({ kind: "reject", id, entity, motif: "" })}>
          {t("tt.ckd.reject")}
        </Button>
      </>
    );
  }

  function flags(p: SessionCheckin | DayCheckin) {
    return (
      <>
        <Badge color={STATUS_BADGE[p.statut].color}>{t(STATUS_BADGE[p.statut].key)}</Badge>
        {p.source === "MANUEL" && <Badge color="blue">{t("tt.ckd.manual")}</Badge>}
        {p.retardSignale && <Badge color="orange">{t("tt.ck.lateMin", { min: p.retardMinutes ?? 0 })}</Badge>}
        {"ecartSalle" in p && p.ecartSalle && <Badge color="red">{t("tt.ckd.otherRoom")}</Badge>}
        {p.horsLigne && <Badge color="gray">{t("tt.ckd.offline")}</Badge>}
      </>
    );
  }

  const rejectForm = (id: string, entity: "sessions" | "days") =>
    form?.kind === "reject" && form.id === id ? (
      <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-surface-muted p-2.5">
        <Field label={t("tt.ckd.rejectReason")}>
          <Input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} />
        </Field>
        <Button variant="danger" disabled={!form.motif.trim()} onClick={() => void decide(entity, id, "REJETE", form.motif)}>
          {t("tt.ckd.confirmReject")}
        </Button>
        <Button variant="ghost" onClick={() => setForm(null)}>
          {t("tt.cancel")}
        </Button>
      </div>
    ) : null;

  return (
    <div>
      <Card className="mb-4">
        <Field label={t("tt.day")}>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" aria-label={t("tt.prevDay")} onClick={() => setDate(shiftWeek(date, -1))}>
              <ChevronLeft size={16} />
            </Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
            <Button variant="secondary" aria-label={t("tt.nextDay")} onClick={() => setDate(shiftWeek(date, 1))}>
              <ChevronRight size={16} />
            </Button>
            {data && date !== data.aujourdhui && (
              <Button variant="ghost" onClick={() => setDate(data.aujourdhui)}>
                {t("tt.today")}
              </Button>
            )}
          </div>
        </Field>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {data?.sansClasse && <p className="mb-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink-muted">{t("tt.noClassDay", { label: data.sansClasse.libelle })}</p>}

      {data && data.seances.length === 0 && data.journees.length === 0 && !data.sansClasse && (
        <EmptyState icon={<UserCheck />} title={t("tt.ckd.emptyTitle")} description={t("tt.ckd.emptyDesc")} />
      )}

      {data && data.seances.length > 0 && (
        <>
          <h2 className="mb-2 font-display text-base font-semibold text-ink">{t("tt.ckd.sessionsTitle")}</h2>
          <ul className="mb-5 space-y-2">
            {[...data.seances]
              .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut) || a.teacherName.localeCompare(b.teacherName, INTL_LOCALE[locale]))
              .map((s) => {
                const key = s.entryId;
                const editing = form?.kind === "session" && form.entryId === key;
                return (
                  <li key={key} className="rounded-2xl border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {s.heureDebut} - {s.heureFin} · {s.teacherName}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {s.className} · {s.subjectName} · {s.roomName}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                          {s.pointage ? (
                            <>
                              <span className="text-ink">{t("tt.ckd.startEnd", { start: s.pointage.debut ?? "-", end: s.pointage.fin ?? "-" })}</span>
                              {flags(s.pointage)}
                            </>
                          ) : (
                            <Badge color="red">{t("tt.ckd.notCheckedSession")}</Badge>
                          )}
                        </div>
                        {s.pointage?.motif && <p className="mt-1 text-xs text-ink-muted">{t("tt.reasonLine", { reason: s.pointage.motif })}</p>}
                      </div>
                      {canValidate && (
                        <div className="flex flex-wrap gap-2">
                          {s.pointage && actions(s.pointage.id, "sessions", s.pointage.statut)}
                          {!editing && (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setForm({ kind: "session", entryId: key, debut: s.pointage?.debut ?? s.heureDebut, fin: s.pointage?.fin ?? s.heureFin, motif: "" })
                              }
                            >
                              {s.pointage ? t("tt.ckd.correct") : t("tt.ckd.enter")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    {s.pointage && rejectForm(s.pointage.id, "sessions")}
                    {editing && form.kind === "session" && (
                      <div className="mt-2 grid gap-2 rounded-xl bg-surface-muted p-2.5 sm:grid-cols-4">
                        <Field label={t("tt.col.start")}>
                          <Input type="time" value={form.debut} onChange={(e) => setForm({ ...form, debut: e.target.value })} />
                        </Field>
                        <Field label={t("tt.col.end")}>
                          <Input type="time" value={form.fin} onChange={(e) => setForm({ ...form, fin: e.target.value })} />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label={t("tt.reasonRequired")}>
                            <Input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder={t("tt.ckd.reasonPlaceholder")} />
                          </Field>
                        </div>
                        <div className="flex gap-2 sm:col-span-4">
                          <Button
                            disabled={!form.motif.trim() || !form.debut || !form.fin}
                            onClick={() =>
                              void run(
                                () => api.post("/teacher-checkins/sessions/manual", { entryId: key, date, debut: form.debut, fin: form.fin, motif: form.motif }),
                                t("tt.ckd.savedValidated"),
                              )
                            }
                          >
                            {t("tt.save")}
                          </Button>
                          <Button variant="ghost" onClick={() => setForm(null)}>
                            {t("tt.cancel")}
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

      {data && data.orphelins.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-surface p-3">
          <p className="mb-1 text-sm font-medium text-ink">{t("tt.ckd.orphansTitle")}</p>
          <ul className="space-y-1 text-sm text-ink-muted">
            {data.orphelins.map((o) => (
              <li key={o.id}>
                {t("tt.ckd.orphanLine", {
                  teacher: o.teacherName,
                  from: o.heureDebut,
                  to: o.heureFin,
                  start: o.debut ?? "-",
                  end: o.fin ?? "-",
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.journees.length > 0 && (
        <>
          <h2 className="mb-2 font-display text-base font-semibold text-ink">{t("tt.ckd.daysTitle")}</h2>
          <ul className="space-y-2">
            {data.journees.map((j) => {
              const editing = form?.kind === "day" && form.teacherId === j.teacherId;
              return (
                <li key={j.teacherId} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{j.teacherName}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                        {j.pointage ? (
                          <>
                            <span className="text-ink">
                              {t("tt.ck.arrivalDeparture", { arrival: j.pointage.arrivee ?? "-", departure: j.pointage.depart ?? "-" })}
                            </span>
                            {flags(j.pointage)}
                          </>
                        ) : (
                          <Badge color="red">{j.prevue ? t("tt.ckd.notCheckedDay") : t("tt.ckd.noCheckin")}</Badge>
                        )}
                      </div>
                      {j.pointage?.motif && <p className="mt-1 text-xs text-ink-muted">{t("tt.reasonLine", { reason: j.pointage.motif })}</p>}
                    </div>
                    {canValidate && (
                      <div className="flex flex-wrap gap-2">
                        {j.pointage && actions(j.pointage.id, "days", j.pointage.statut)}
                        {!editing && (
                          <Button
                            variant="secondary"
                            onClick={() => setForm({ kind: "day", teacherId: j.teacherId, arrivee: j.pointage?.arrivee ?? "", depart: j.pointage?.depart ?? "", motif: "" })}
                          >
                            {j.pointage ? t("tt.ckd.correct") : t("tt.ckd.enter")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {j.pointage && rejectForm(j.pointage.id, "days")}
                  {editing && form.kind === "day" && (
                    <div className="mt-2 grid gap-2 rounded-xl bg-surface-muted p-2.5 sm:grid-cols-4">
                      <Field label={t("tt.ckd.arrival")}>
                        <Input type="time" value={form.arrivee} onChange={(e) => setForm({ ...form, arrivee: e.target.value })} />
                      </Field>
                      <Field label={t("tt.ckd.departureOptional")}>
                        <Input type="time" value={form.depart} onChange={(e) => setForm({ ...form, depart: e.target.value })} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label={t("tt.reasonRequired")}>
                          <Input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} />
                        </Field>
                      </div>
                      <div className="flex gap-2 sm:col-span-4">
                        <Button
                          disabled={!form.motif.trim() || !form.arrivee}
                          onClick={() =>
                            void run(
                              () =>
                                api.post("/teacher-checkins/days/manual", {
                                  teacherId: j.teacherId,
                                  date,
                                  arrivee: form.arrivee,
                                  depart: form.depart || undefined,
                                  motif: form.motif,
                                }),
                              t("tt.ckd.savedValidated"),
                            )
                          }
                        >
                          {t("tt.save")}
                        </Button>
                        <Button variant="ghost" onClick={() => setForm(null)}>
                          {t("tt.cancel")}
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
    </div>
  );
}
