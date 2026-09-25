"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import type { AcademicYear, CalendarEvent, CalendarEventType, Term } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { CalendarDays } from "lucide-react";
import { describeError, formatDay, TAB_HINT } from "./shared";

const EVENT_LABEL: Record<CalendarEventType, MessageKey> = {
  VACANCES: "sl.calendar.type.VACANCES",
  FERIE: "sl.calendar.type.FERIE",
  AUTRE: "sl.calendar.type.AUTRE",
};
const EVENT_COLOR: Record<CalendarEventType, "blue" | "orange" | "slate"> = {
  VACANCES: "blue",
  FERIE: "orange",
  AUTRE: "slate",
};

/** Trimestres et jours sans classe d'une année scolaire (D55) : dates saisies, jamais codées. */
export function CalendrierTab({
  years,
  activeYear,
  onChanged,
}: {
  years: AcademicYear[];
  activeYear: AcademicYear | null;
  onChanged: () => void;
}) {
  const { t: tr } = useI18n();
  const [yearId, setYearId] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [termForm, setTermForm] = useState({ libelle: "", dateDebut: "", dateFin: "" });
  const [eventForm, setEventForm] = useState<{ type: CalendarEventType; libelle: string; dateDebut: string; dateFin: string }>({
    type: "VACANCES",
    libelle: "",
    dateDebut: "",
    dateFin: "",
  });
  const [editingTerm, setEditingTerm] = useState<string | null>(null);
  const [termEdit, setTermEdit] = useState({ libelle: "", dateDebut: "", dateFin: "" });
  const expand = useExpanded();

  const year = years.find((y) => y.id === yearId) ?? null;
  const closed = year?.statut === "CLOTUREE";

  useEffect(() => {
    if (!yearId && activeYear) setYearId(activeYear.id);
  }, [activeYear, yearId]);

  async function load() {
    if (!yearId) return;
    const [t, e] = await Promise.all([
      api.get<Term[]>(`/terms?academicYearId=${yearId}`),
      api.get<CalendarEvent[]>(`/calendar-events?academicYearId=${yearId}`),
    ]);
    setTerms(t);
    setEvents(e);
  }

  useEffect(() => {
    void load().catch((e) => setError(describeError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const day = (iso: string) => iso.slice(0, 10);

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{tr("sl.calendar.title")}</h2>
            <p className={TAB_HINT}>{tr("sl.calendar.hint")}</p>
          </div>
          <div className="w-full max-w-xs">
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label={tr("sl.calendar.year")}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.libelle}
                  {y.statut === "ACTIVE" ? tr("sl.calendar.yearActive") : y.statut === "CLOTUREE" ? tr("sl.calendar.yearClosed") : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {year && (
          <p className={`mb-3 ${TAB_HINT}`}>
            {tr("sl.calendar.range", { from: formatDay(year.dateDebut), to: formatDay(year.dateFin) })}
            {closed ? ` ${tr("sl.calendar.closedNote")}` : ""}
          </p>
        )}
        <ErrorMessage>{error}</ErrorMessage>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-base font-semibold text-ink">{tr("sl.calendar.terms.title")}</h3>

        {!closed && year && (
          <form
            className="mb-4 space-y-3 border-b border-border pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api.post("/terms", { academicYearId: yearId, ...termForm }),
                () => setTermForm({ libelle: "", dateDebut: "", dateFin: "" }),
              );
            }}
          >
            <p className="text-sm font-semibold text-ink">{tr("sl.calendar.terms.addTitle")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={tr("sl.calendar.label")}>
                <Input required placeholder={tr("sl.calendar.terms.labelPlaceholder")} value={termForm.libelle} onChange={(e) => setTermForm({ ...termForm, libelle: e.target.value })} />
              </Field>
              <Field label={tr("sl.calendar.terms.start")}>
                <Input type="date" required value={termForm.dateDebut} onChange={(e) => setTermForm({ ...termForm, dateDebut: e.target.value })} />
              </Field>
              <Field label={tr("sl.calendar.terms.end")}>
                <Input type="date" required value={termForm.dateFin} onChange={(e) => setTermForm({ ...termForm, dateFin: e.target.value })} />
              </Field>
            </div>
            <Button type="submit">{tr("sl.calendar.terms.submit")}</Button>
          </form>
        )}

        {terms.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title={tr("sl.calendar.terms.empty.title")} description={tr("sl.calendar.terms.empty.description")} />
        ) : (
          <ul className="space-y-2">
            {terms.map((t) => (
              <li key={t.id} className="rounded-xl border border-border p-3">
                {editingTerm === t.id ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input value={termEdit.libelle} onChange={(e) => setTermEdit({ ...termEdit, libelle: e.target.value })} />
                    <Input type="date" value={termEdit.dateDebut} onChange={(e) => setTermEdit({ ...termEdit, dateDebut: e.target.value })} />
                    <Input type="date" value={termEdit.dateFin} onChange={(e) => setTermEdit({ ...termEdit, dateFin: e.target.value })} />
                    <div className="flex gap-2 sm:col-span-3">
                      <Button onClick={() => void run(() => api.patch(`/terms/${t.id}`, termEdit), () => setEditingTerm(null))}>{tr("sl.common.save")}</Button>
                      <Button variant="secondary" onClick={() => setEditingTerm(null)}>
                        {tr("sl.common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge color="primary">{tr("sl.calendar.terms.number", { n: t.ordre })}</Badge>
                      <span className="font-medium text-ink">{t.libelle}</span>
                      <span className="text-sm text-ink-muted">
                        {tr("sl.calendar.fromTo", { from: formatDay(t.dateDebut), to: formatDay(t.dateFin) })}
                      </span>
                    </div>
                    {!closed && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingTerm(t.id);
                            setTermEdit({ libelle: t.libelle, dateDebut: day(t.dateDebut), dateFin: day(t.dateFin) });
                          }}
                        >
                          {tr("sl.common.edit")}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => {
                            if (confirm(tr("sl.calendar.confirmDelete", { name: t.libelle }))) void run(() => api.delete(`/terms/${t.id}`));
                          }}
                        >
                          {tr("sl.common.delete")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-base font-semibold text-ink">{tr("sl.calendar.events.title")}</h3>

        {!closed && year && (
          <form
            className="mb-4 space-y-3 border-b border-border pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  api.post("/calendar-events", {
                    academicYearId: yearId,
                    type: eventForm.type,
                    libelle: eventForm.libelle,
                    dateDebut: eventForm.dateDebut,
                    dateFin: eventForm.dateFin || undefined,
                  }),
                () => setEventForm({ type: eventForm.type, libelle: "", dateDebut: "", dateFin: "" }),
              );
            }}
          >
            <p className="text-sm font-semibold text-ink">{tr("sl.calendar.events.addTitle")}</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label={tr("sl.calendar.events.type")}>
                <Select value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value as CalendarEventType })}>
                  <option value="VACANCES">{tr("sl.calendar.type.VACANCES")}</option>
                  <option value="FERIE">{tr("sl.calendar.type.FERIE")}</option>
                  <option value="AUTRE">{tr("sl.calendar.type.AUTRE")}</option>
                </Select>
              </Field>
              <Field label={tr("sl.calendar.label")}>
                <Input required placeholder={tr("sl.calendar.events.labelPlaceholder")} value={eventForm.libelle} onChange={(e) => setEventForm({ ...eventForm, libelle: e.target.value })} />
              </Field>
              <Field label={tr("sl.calendar.events.firstDay")}>
                <Input type="date" required value={eventForm.dateDebut} onChange={(e) => setEventForm({ ...eventForm, dateDebut: e.target.value })} />
              </Field>
              <Field label={tr("sl.calendar.events.lastDay")}>
                <Input type="date" value={eventForm.dateFin} onChange={(e) => setEventForm({ ...eventForm, dateFin: e.target.value })} />
              </Field>
            </div>
            <Button type="submit">{tr("sl.calendar.events.submit")}</Button>
          </form>
        )}

        {events.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title={tr("sl.calendar.events.empty.title")} description={tr("sl.calendar.events.empty.description")} />
        ) : (
          <>
            <ExpandAll count={events.length} onOpenAll={() => expand.openAll(events.map((x) => x.id))} onCloseAll={expand.closeAll} />
            <ul className="space-y-2">
              {events.map((ev) => {
                const expanded = expand.isOpen(ev.id);
                return (
                  <li key={ev.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <ExpandButton open={expanded} onClick={() => expand.toggle(ev.id)} label={ev.libelle} />
                      <Badge color={EVENT_COLOR[ev.type]}>{tr(EVENT_LABEL[ev.type])}</Badge>
                      <span className="font-medium text-ink">{ev.libelle}</span>
                      <span className="text-sm text-ink-muted">
                        {day(ev.dateDebut) === day(ev.dateFin) ? formatDay(ev.dateDebut) : tr("sl.calendar.fromTo", { from: formatDay(ev.dateDebut), to: formatDay(ev.dateFin) })}
                      </span>
                    </div>
                    {expanded && !closed && (
                      <div className="mt-3 border-t border-border pt-3">
                        <Button
                          variant="danger"
                          onClick={() => {
                            if (confirm(tr("sl.calendar.confirmDelete", { name: ev.libelle }))) void run(() => api.delete(`/calendar-events/${ev.id}`));
                          }}
                        >
                          {tr("sl.common.delete")}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
