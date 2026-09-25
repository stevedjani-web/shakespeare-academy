"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CheckinSummary, CheckinSummaryRow } from "@/lib/types";
import { Badge, Card, ErrorMessage, Field, Input, Spinner } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { buildSection } from "@/lib/export";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatMinutes, todayLocal } from "./shared";

const prevues = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesPrevues : r.joursPrevus) ?? 0;
const effectuees = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesTenues : r.joursPresents) ?? 0;
const enAttente = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesEnAttente : r.joursEnAttente) ?? 0;
const incompletes = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesIncompletes : r.joursIncomplets) ?? 0;
const nonPointees = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesNonPointees : r.joursNonPointes) ?? 0;
const modeLabel = (r: CheckinSummaryRow) => translate(r.mode === "SEANCE" ? "tt.sum.modeSession" : "tt.sum.modeDay");

/**
 * Heures effectuées d'un mois : calculées d'après les pointages validés (RV07), jamais saisies. Un
 * enseignant qui pointe par séance est compté sur la durée des séances tenues ; les autres sur leurs
 * jours de présence, entre l'arrivée et le départ.
 */
export function PointageSummaryTab() {
  const { t } = useI18n();
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [data, setData] = useState<CheckinSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    try {
      setData(await api.get<CheckinSummary>(`/teacher-checkins/summary?month=${month}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.enseignants ?? [];
  const section = buildSection(
    t("tt.sum.sectionTitle", { month }),
    [
      { header: t("tt.col.teacher"), value: (r: CheckinSummaryRow) => r.enseignant },
      { header: t("tt.sum.colMode"), value: (r) => modeLabel(r) },
      { header: t("tt.sum.colPlannedLong"), value: (r) => prevues(r), kind: "number" },
      { header: t("tt.sum.colDoneLong"), value: (r) => effectuees(r), kind: "number" },
      { header: t("tt.sum.colToValidate"), value: (r) => enAttente(r), kind: "number" },
      { header: t("tt.sum.colNotChecked"), value: (r) => nonPointees(r), kind: "number" },
      { header: t("tt.sum.colIncompleteLong"), value: (r) => incompletes(r), kind: "number" },
      { header: t("tt.sum.colHoursLong"), value: (r) => formatMinutes(r.minutesEffectuees) },
      { header: t("tt.sum.colLatesLong"), value: (r) => r.retards, kind: "number" },
      { header: t("tt.sum.colLateMinutes"), value: (r) => r.minutesRetard, kind: "number" },
      { header: t("tt.sum.colSubstituted"), value: (r) => r.confieesARemplacant, kind: "number" },
    ],
    rows,
  );

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label={t("tt.sum.month")}>
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />
          </Field>
          <ExportButtons
            fileName={t("tt.sum.file", { month })}
            title={t("tt.ckp.title")}
            subtitle={data?.jusquau ? t("tt.sum.subtitleUntil", { month, date: data.jusquau }) : t("tt.sum.subtitle", { month })}
            sections={[section]}
            landscape
          />
        </div>
        <p className="mt-2 text-xs text-ink-muted">{t("tt.sum.rule", { minutes: data?.toleranceRetardMinutes ?? t("tt.ellipsis") })}</p>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {!data && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("tt.sum.calculating")}
        </p>
      )}

      {data && rows.length === 0 && <p className="text-sm text-ink-muted">{t("tt.sum.empty")}</p>}

      {data && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-semibold text-ink-muted">
                <th className="px-3 py-2">{t("tt.col.teacher")}</th>
                <th className="px-3 py-2">{t("tt.sum.thPlanned")}</th>
                <th className="px-3 py-2">{t("tt.sum.thDone")}</th>
                <th className="px-3 py-2">{t("tt.sum.colToValidate")}</th>
                <th className="px-3 py-2">{t("tt.sum.colNotChecked")}</th>
                <th className="px-3 py-2">{t("tt.sum.thIncomplete")}</th>
                <th className="px-3 py-2">{t("tt.sum.thHours")}</th>
                <th className="px-3 py-2">{t("tt.sum.thLates")}</th>
                <th className="px-3 py-2">{t("tt.sum.thSubstituted")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teacherId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{r.enseignant}</p>
                    <Badge color={r.mode === "SEANCE" ? "primary" : "blue"}>{modeLabel(r)}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {r.mode === "SEANCE" ? t("tt.sum.nSessions", { count: prevues(r) }) : t("tt.sum.nDays", { count: prevues(r) })}
                  </td>
                  <td className="px-3 py-2">{effectuees(r)}</td>
                  <td className="px-3 py-2">{enAttente(r)}</td>
                  <td className={`px-3 py-2 ${nonPointees(r) > 0 ? "font-medium text-danger" : ""}`}>{nonPointees(r)}</td>
                  <td className={`px-3 py-2 ${incompletes(r) > 0 ? "font-medium text-warning" : ""}`}>{incompletes(r)}</td>
                  <td className="px-3 py-2 font-medium text-ink">{formatMinutes(r.minutesEffectuees)}</td>
                  <td className="px-3 py-2">{t("tt.sum.lateCell", { count: r.retards, minutes: r.minutesRetard })}</td>
                  <td className="px-3 py-2">{r.confieesARemplacant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
