"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { PERIOD_LABEL, rankLabel, type StudentBulletinRow } from "@/lib/grades";
import { Badge, Card } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";

// VALIDE (pas encore publié) reste visible au personnel, jamais aux parents — d'où une couleur distincte
// de PUBLIE : un bulletin encore orange ici n'est pas une anomalie, juste pas encore mis à disposition.
const STATUT_COLOR: Record<StudentBulletinRow["statut"], "orange" | "green"> = {
  OUVERT: "orange",
  VALIDE: "orange",
  PUBLIE: "green",
};

/**
 * Notes et bulletins d'un élève (Direction, Administrateur — GRADE_READ), pour la vue 360° du dossier.
 * Le détail (matières, appréciations) reste sur la page d'impression déjà existante (/bulletins/[id]),
 * jamais dupliqué ici — un simple lien vers chaque bulletin.
 */
export function StudentGradesCard({ studentId }: { studentId: string }) {
  const expand = useExpanded();
  const { t } = useI18n();
  const [bulletins, setBulletins] = useState<StudentBulletinRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void api
      .get<StudentBulletinRow[]>(`/students/${studentId}/bulletins`)
      .then(setBulletins)
      .catch(() => setFailed(true));
  }, [studentId]);

  if (failed || !bulletins) return null;
  const open = expand.isOpen("notes");
  const dernier = bulletins[0];

  return (
    <Card className="lg:col-span-3">
      <h2 className={`flex flex-wrap items-center gap-2 text-sm font-semibold text-ink ${open ? "mb-3" : ""}`}>
        <ExpandButton open={open} onClick={() => expand.toggle("notes")} label={t("stu.grades.expandLabel")} />
        <BookOpenCheck size={16} className="text-primary" /> {t("stu.grades.title")}
        {!open && (
          <span className="font-normal text-ink-muted">
            {dernier
              ? t("stu.grades.lastAverage", {
                  average: dernier.moyenneGenerale !== null ? `${dernier.moyenneGenerale}/20` : "—",
                  term: dernier.trimestre,
                })
              : t("stu.grades.noReport")}
          </span>
        )}
      </h2>
      {open && (
        <>
          {bulletins.length === 0 && (
            <p className="text-sm text-ink-muted">{t("stu.grades.noTerm")}</p>
          )}
          <ul className="divide-y divide-border">
            {bulletins.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <Link href={`/bulletins/${b.id}`} className="font-medium text-primary underline">
                    {b.trimestre}
                  </Link>{" "}
                  <span className="text-ink-muted">
                    {t("stu.grades.line", {
                      class: b.classe,
                      year: b.annee,
                      average: b.moyenneGenerale !== null ? `${b.moyenneGenerale}/20` : "—",
                      rank: rankLabel(b.rang, b.effectif),
                    })}
                  </span>
                </div>
                <Badge color={STATUT_COLOR[b.statut]}>{PERIOD_LABEL[b.statut]}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
