"use client";

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { api } from "@/lib/api";
import type { StudentAttendanceHistory } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { formatIso } from "@/components/emploi-du-temps/shared";

/** Assiduité d'un élève : compteurs et liste de ses absences et retards, avec leur justificatif. */
export function AttendanceHistoryCard({ studentId }: { studentId: string }) {
  const expand = useExpanded();
  const [data, setData] = useState<StudentAttendanceHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void api
      .get<StudentAttendanceHistory>(`/attendance/students/${studentId}/history`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [studentId]);

  if (failed || !data) return null;
  const { compteurs, lignes } = data;
  const open = expand.isOpen("assiduite");

  return (
    <Card className="lg:col-span-3">
      <h2 className={`flex flex-wrap items-center gap-2 text-sm font-semibold text-ink ${open ? "mb-3" : ""}`}>
        <ExpandButton open={open} onClick={() => expand.toggle("assiduite")} label="l'assiduité" />
        <UserX size={16} className="text-primary" /> Assiduité
        {!open && (
          <span className="font-normal text-ink-muted">
            {compteurs.absences} absence(s), {compteurs.retards} retard(s) sur {compteurs.seancesAppelees} séance(s) appelée(s)
          </span>
        )}
      </h2>
      {open && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge color="gray">{compteurs.seancesAppelees} séance(s) appelée(s)</Badge>
            <Badge color="red">{compteurs.absences} absence(s)</Badge>
            <Badge color="orange">{compteurs.retards} retard(s)</Badge>
            <Badge color="green">{compteurs.excusees} excusée(s)</Badge>
            <Badge color="blue">{compteurs.nonJustifiees} non justifiée(s)</Badge>
          </div>
          {lignes.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucune absence ni aucun retard enregistré.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {lignes.map((l) => (
                <li key={l.recordId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="text-ink">
                    {formatIso(l.date)} · {l.heureDebut} · {l.matiere}
                  </span>
                  <span className="flex gap-1.5">
                    <Badge color={l.statut === "ABSENT" ? "red" : "orange"}>
                      {l.statut === "ABSENT" ? "Absent" : `Retard${l.minutesRetard ? ` ${l.minutesRetard} min` : ""}`}
                    </Badge>
                    <Badge color={l.justification?.statut === "ACCEPTEE" ? "green" : l.justification ? "blue" : "gray"}>
                      {l.justification ? (l.justification.statut === "ACCEPTEE" ? "Excusée" : l.justification.statut === "REFUSEE" ? "Refusée" : "À décider") : "Non justifiée"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
