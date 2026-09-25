"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
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
  const { t, locale } = useI18n();
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
    // lg (1024px), pas sm (640px) : à cette largeur, la barre latérale (256px) grignote l'espace réel et
    // ferait tenir trois cartes dans ~140px chacune (« Situation financière » se scinde sur deux lignes) —
    // repéré en vérifiant le rendu sur tablette (768px). Le reste de la page utilise déjà lg:grid-cols-3
    // pour la même raison (la grille des cartes détaillées plus bas).
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      {canGrades && (
        <StatCard
          label={t("stu.strip.average")}
          value={dernierBulletin?.moyenneGenerale !== null && dernierBulletin?.moyenneGenerale !== undefined ? `${dernierBulletin.moyenneGenerale}/20` : "—"}
          hint={dernierBulletin ? dernierBulletin.trimestre : bulletins ? t("stu.strip.noReport") : t("stu.strip.loading")}
          tone="primary"
        />
      )}
      {canAttendance && attendance && (
        <StatCard
          label={t("stu.strip.attendance")}
          value={tauxPresence !== null ? `${tauxPresence}%` : "—"}
          hint={t("stu.strip.attHint", {
            absences: attendance.compteurs.absences,
            lates: attendance.compteurs.retards,
            sessions: attendance.compteurs.seancesAppelees,
          })}
          tone={tauxPresence === null ? "info" : tauxPresence < 80 ? "warning" : "success"}
          progress={tauxPresence}
        />
      )}
      {canFinance && finance && (
        <StatCard
          label={t("stu.strip.finance")}
          value={STATUS_META[finance.statut].label}
          hint={
            finance.montantRestant > 0
              ? t("stu.strip.remaining", { amount: finance.montantRestant.toLocaleString(INTL_LOCALE[locale]) })
              : t("stu.strip.upToDate")
          }
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
