"use client";

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { StudentAttendanceHistory } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { formatIso } from "@/components/emploi-du-temps/shared";

/** Assiduité d'un élève : compteurs et liste de ses absences et retards, avec leur justificatif. */
export function AttendanceHistoryCard({ studentId }: { studentId: string }) {
  const expand = useExpanded();
  const { t } = useI18n();
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
        <ExpandButton open={open} onClick={() => expand.toggle("assiduite")} label={t("stu.att.expandLabel")} />
        <UserX size={16} className="text-primary" /> {t("stu.att.title")}
        {!open && (
          <span className="font-normal text-ink-muted">
            {t("stu.att.summary", { absences: compteurs.absences, lates: compteurs.retards, sessions: compteurs.seancesAppelees })}
          </span>
        )}
      </h2>
      {open && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge color="gray">{t("stu.att.sessionsCalled", { count: compteurs.seancesAppelees })}</Badge>
            <Badge color="red">{t("stu.att.absences", { count: compteurs.absences })}</Badge>
            <Badge color="orange">{t("stu.att.lates", { count: compteurs.retards })}</Badge>
            <Badge color="green">{t("stu.att.excused", { count: compteurs.excusees })}</Badge>
            <Badge color="blue">{t("stu.att.unjustified", { count: compteurs.nonJustifiees })}</Badge>
          </div>
          {lignes.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("stu.att.none")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {lignes.map((l) => (
                <li key={l.recordId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="text-ink">
                    {formatIso(l.date)} · {l.heureDebut} · {l.matiere}
                  </span>
                  <span className="flex gap-1.5">
                    <Badge color={l.statut === "ABSENT" ? "red" : "orange"}>
                      {l.statut === "ABSENT"
                        ? t("stu.att.absent")
                        : l.minutesRetard
                          ? t("stu.att.lateMinutes", { minutes: l.minutesRetard })
                          : t("stu.att.late")}
                    </Badge>
                    <Badge color={l.justification?.statut === "ACCEPTEE" ? "green" : l.justification ? "blue" : "gray"}>
                      {l.justification
                        ? l.justification.statut === "ACCEPTEE"
                          ? t("stu.att.jExcused")
                          : l.justification.statut === "REFUSEE"
                            ? t("stu.att.jRefused")
                            : t("stu.att.jToDecide")
                        : t("stu.att.jNone")}
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
