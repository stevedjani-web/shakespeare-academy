"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { FinancialStatus, StudentAttendanceHistory } from "@/lib/types";
import type { StudentBulletinRow } from "@/lib/grades";
import { STATUS_META } from "@/components/financial-status-card";
import { StatCard } from "@/components/ui";

/**
 * Vue 360° du dossier élève : un bandeau de synthèse avant les sections détaillées (identité, finances,
 * assiduité, notes, discipline...), pour un coup d'œil sans avoir à ouvrir chaque carte.
 *
 * La discipline n'y figure JAMAIS : StudentDisciplineCard ne charge son contenu qu'à l'ouverture, car
 * chaque lecture du dossier de vie scolaire d'un élève est journalisée (RV, cadrage Lot 20) — l'afficher
 * ici forcerait une lecture (et donc une trace) à chaque simple consultation du dossier, jamais voulu.
 * Chaque indicateur reste absent si la permission correspondante manque ou si la donnée n'existe pas
 * encore (jamais un chiffre à zéro inventé pour combler une case vide).
 */
export function StudentSummaryStrip({ studentId }: { studentId: string }) {
  const { hasPermission } = useAuth();
  const [finance, setFinance] = useState<FinancialStatus | null>(null);
  const [attendance, setAttendance] = useState<StudentAttendanceHistory | null>(null);
  const [bulletins, setBulletins] = useState<StudentBulletinRow[] | null>(null);

  const canFinance = hasPermission("FINANCE_READ");
  const canAttendance = hasPermission("ATTENDANCE_READ");
  const canGrades = hasPermission("GRADE_READ");

  useEffect(() => {
    if (canFinance) void api.get<FinancialStatus>(`/students/${studentId}/financial-status`).then(setFinance).catch(() => {});
    if (canAttendance)
      void api
        .get<StudentAttendanceHistory>(`/attendance/students/${studentId}/history`)
        .then(setAttendance)
        .catch(() => {});
    if (canGrades) void api.get<StudentBulletinRow[]>(`/students/${studentId}/bulletins`).then(setBulletins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (!canFinance && !canAttendance && !canGrades) return null;

  const dernierBulletin = bulletins?.[0];
  const tauxPresence =
    attendance && attendance.compteurs.seancesAppelees > 0
      ? Math.round(
          ((attendance.compteurs.seancesAppelees - attendance.compteurs.absences) / attendance.compteurs.seancesAppelees) * 100,
        )
      : null;

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      {canGrades && (
        <StatCard
          label="Moyenne actuelle"
          value={dernierBulletin?.moyenneGenerale !== null && dernierBulletin?.moyenneGenerale !== undefined ? `${dernierBulletin.moyenneGenerale}/20` : "—"}
          hint={dernierBulletin ? dernierBulletin.trimestre : bulletins ? "Aucun bulletin pour l'instant" : "Chargement…"}
          tone="primary"
        />
      )}
      {canAttendance && attendance && (
        <StatCard
          label="Assiduité"
          value={tauxPresence !== null ? `${tauxPresence}%` : "—"}
          hint={`${attendance.compteurs.absences} absence(s), ${attendance.compteurs.retards} retard(s) sur ${attendance.compteurs.seancesAppelees} séance(s)`}
          tone={tauxPresence === null ? "info" : tauxPresence < 80 ? "warning" : "success"}
          progress={tauxPresence}
        />
      )}
      {canFinance && finance && (
        <StatCard
          label="Situation financière"
          value={STATUS_META[finance.statut].label}
          hint={finance.montantRestant > 0 ? `${finance.montantRestant.toLocaleString("fr-FR")} restant dû` : "À jour"}
          tone={
            finance.statut === "SOLVABLE" || finance.statut === "EXONERE"
              ? "success"
              : finance.statut === "IMPAYE_CRITIQUE"
                ? "danger"
                : "warning"
          }
        />
      )}
    </div>
  );
}
