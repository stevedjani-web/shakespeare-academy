"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CheckinSummary, CheckinSummaryRow } from "@/lib/types";
import { Badge, Card, ErrorMessage, Field, Input, Spinner } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { buildSection } from "@/lib/export";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatMinutes, todayLocal } from "./shared";

const prevues = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesPrevues : r.joursPrevus) ?? 0;
const effectuees = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesTenues : r.joursPresents) ?? 0;
const enAttente = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesEnAttente : r.joursEnAttente) ?? 0;
const incompletes = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesIncompletes : r.joursIncomplets) ?? 0;
const nonPointees = (r: CheckinSummaryRow) => (r.mode === "SEANCE" ? r.seancesNonPointees : r.joursNonPointes) ?? 0;

/**
 * Heures effectuées d'un mois : calculées d'après les pointages validés (RV07), jamais saisies. Un
 * enseignant qui pointe par séance est compté sur la durée des séances tenues ; les autres sur leurs
 * jours de présence, entre l'arrivée et le départ.
 */
export function PointageSummaryTab() {
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
    `Pointage ${month}`,
    [
      { header: "Enseignant", value: (r: CheckinSummaryRow) => r.enseignant },
      { header: "Pointage", value: (r) => (r.mode === "SEANCE" ? "Par séance" : "Arrivée et départ") },
      { header: "Prévu (séances ou jours)", value: (r) => prevues(r), kind: "number" },
      { header: "Effectué (validé)", value: (r) => effectuees(r), kind: "number" },
      { header: "À valider", value: (r) => enAttente(r), kind: "number" },
      { header: "Non pointé", value: (r) => nonPointees(r), kind: "number" },
      { header: "Incomplet (fin ou départ manquant)", value: (r) => incompletes(r), kind: "number" },
      { header: "Heures effectuées", value: (r) => formatMinutes(r.minutesEffectuees) },
      { header: "Retards signalés", value: (r) => r.retards, kind: "number" },
      { header: "Minutes de retard", value: (r) => r.minutesRetard, kind: "number" },
      { header: "Séances confiées à un remplaçant", value: (r) => r.confieesARemplacant, kind: "number" },
    ],
    rows,
  );

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label="Mois">
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />
          </Field>
          <ExportButtons
            fileName={`pointage-enseignants-${month}`}
            title="Pointage des enseignants"
            subtitle={`Mois ${month}${data?.jusquau ? `, jusqu'au ${data.jusquau}` : ""}`}
            sections={[section]}
            landscape
          />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Seuls les pointages validés comptent dans les heures. Retard signalé au-delà de {data?.toleranceRetardMinutes ?? "…"} minutes.
        </p>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {!data && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Calcul en cours…
        </p>
      )}

      {data && rows.length === 0 && <p className="text-sm text-ink-muted">Aucun enseignant à afficher pour ce mois.</p>}

      {data && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-semibold text-ink-muted">
                <th className="px-3 py-2">Enseignant</th>
                <th className="px-3 py-2">Prévu</th>
                <th className="px-3 py-2">Effectué</th>
                <th className="px-3 py-2">À valider</th>
                <th className="px-3 py-2">Non pointé</th>
                <th className="px-3 py-2">Incomplet</th>
                <th className="px-3 py-2">Heures</th>
                <th className="px-3 py-2">Retards</th>
                <th className="px-3 py-2">Remplacé</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teacherId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{r.enseignant}</p>
                    <Badge color={r.mode === "SEANCE" ? "primary" : "blue"}>{r.mode === "SEANCE" ? "Par séance" : "Arrivée et départ"}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {prevues(r)} {r.mode === "SEANCE" ? "séance(s)" : "jour(s)"}
                  </td>
                  <td className="px-3 py-2">{effectuees(r)}</td>
                  <td className="px-3 py-2">{enAttente(r)}</td>
                  <td className={`px-3 py-2 ${nonPointees(r) > 0 ? "font-medium text-danger" : ""}`}>{nonPointees(r)}</td>
                  <td className={`px-3 py-2 ${incompletes(r) > 0 ? "font-medium text-warning" : ""}`}>{incompletes(r)}</td>
                  <td className="px-3 py-2 font-medium text-ink">{formatMinutes(r.minutesEffectuees)}</td>
                  <td className="px-3 py-2">
                    {r.retards} ({r.minutesRetard} min)
                  </td>
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
