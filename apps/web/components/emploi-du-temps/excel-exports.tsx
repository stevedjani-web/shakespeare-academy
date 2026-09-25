"use client";

import { useState } from "react";
import { FileSpreadsheet, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Button, ErrorMessage } from "@/components/ui";
import {
  buildGridSheets,
  buildHoursSheets,
  downloadWorkbook,
  type XlClass,
  type XlEntry,
  type XlLabels,
  type XlSlot,
  type XlTeacher,
} from "@/lib/timetable-excel";

/**
 * Exports Excel d'une version de l'emploi du temps : la grille par classe (mise en page du fichier de l'école, un onglet
 * par classe) et les heures hebdomadaires par enseignant. Faits dans le navigateur, à partir de ce qui est affiché.
 */
export function TimetableExcelButtons({
  entries,
  slots,
  classes,
  teachers,
  days,
  yearLabel,
  versionLabel,
}: {
  entries: XlEntry[];
  slots: XlSlot[];
  classes: XlClass[];
  /** Enseignants connus (pour lister aussi ceux qui n'ont aucune séance) ; facultatif. */
  teachers?: XlTeacher[];
  days: number[];
  yearLabel: string;
  versionLabel: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"grid" | "hours" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function labels(): XlLabels {
    return {
      classLabel: t("tt.xl.classLabel"),
      yearLabel: t("tt.xl.yearLabel"),
      title: t("tt.xl.title"),
      daysHeader: t("tt.xl.daysHeader"),
      pause: t("tt.xl.pause"),
      days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, t(`tt.day.${d}` as "tt.day.1")])),
      hoursTitle: t("tt.xl.hoursTitle", { year: yearLabel, version: versionLabel }),
      colTeacher: t("tt.xl.colTeacher"),
      colSubjects: t("tt.xl.colSubjects"),
      colClasses: t("tt.xl.colClasses"),
      colSessions: t("tt.xl.colSessions"),
      colHours: t("tt.xl.colHours"),
      colClass: t("tt.xl.colClass"),
      colSubject: t("tt.xl.colSubject"),
      total: t("tt.xl.total"),
      noSession: t("tt.xl.noSession"),
      sheetTotal: t("tt.xl.sheetTotal"),
      sheetDetail: t("tt.xl.sheetDetail"),
      sheetDay: t("tt.xl.sheetDay"),
      detailTitle: t("tt.xl.detailTitle"),
      dayTitle: t("tt.xl.dayTitle"),
    };
  }

  async function run(kind: "grid" | "hours") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "grid") {
        const sheets = buildGridSheets({ entries, slots, classes, days, yearLabel, labels: labels() });
        await downloadWorkbook(`${t("tt.xl.fileGrid")}-${versionLabel}`, sheets);
      } else {
        const sheets = buildHoursSheets({ entries, teachers, classes, days, labels: labels() });
        await downloadWorkbook(`${t("tt.xl.fileHours")}-${versionLabel}`, sheets);
      }
    } catch {
      setError(t("common.exportFailed"));
    } finally {
      setBusy(null);
    }
  }

  const disabled = entries.length === 0 || busy !== null;
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => void run("grid")}>
        <FileSpreadsheet size={16} /> {t("tt.xl.grid")}
      </Button>
      <Button variant="secondary" disabled={disabled} onClick={() => void run("hours")}>
        <Users size={16} /> {t("tt.xl.hours")}
      </Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </>
  );
}
