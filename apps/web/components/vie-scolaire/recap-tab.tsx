"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { AcademicYear, Class, PedagogySummary, Teacher } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Select, Spinner, SuccessMessage } from "@/components/ui";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { describeError, TAB_HINT, WEEK_DAYS } from "./shared";

export type VieScolaireTab = "recap" | "horaires" | "matieres" | "enseignants" | "affectations" | "calendrier" | "salles" | "assiduite" | "assistant";

/** Où en est la saisie : ce qui est rempli, ce qui manque, avec un raccourci vers chaque écran. */
export function RecapTab({
  summary,
  years,
  yearId,
  onYearChange,
  onGo,
  onChanged,
}: {
  summary: PedagogySummary | null;
  years: AcademicYear[];
  yearId: string;
  onYearChange: (id: string) => void;
  onGo: (tab: VieScolaireTab) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.get<Teacher[]>("/teachers").then((list) => setTeachers(list.filter((x) => x.statut === "ACTIF"))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!yearId) return;
    void api.get<Class[]>(`/classes?academicYearId=${yearId}`).then(setClasses).catch(() => {});
  }, [yearId]);

  useEffect(() => {
    setClassId(summary?.pilote.classe?.id ?? "");
    setTeacherId(summary?.pilote.enseignant?.id ?? "");
  }, [summary]);

  async function savePilot() {
    setError(null);
    setSaved(false);
    try {
      await api.put("/pedagogy/pilot", { classId: classId || null, teacherId: teacherId || null });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (!summary) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
        <Spinner /> {t("sl.recap.loading")}
      </div>
    );
  }

  const jours = WEEK_DAYS.filter((d) => summary.joursClasse.includes(d.value)).map((d) => d.label.slice(0, 3)).join(", ");
  const nbCreneaux = summary.creneaux.communs + summary.creneaux.parSection;

  const items: Array<{ done: boolean; title: string; detail: string; tab: VieScolaireTab; action: string }> = [
    {
      done: nbCreneaux > 0,
      title: t("sl.recap.days.title"),
      detail: t("sl.recap.days.detail", {
        jours,
        n: nbCreneaux,
        own: summary.creneaux.parSection > 0 ? t("sl.recap.days.own", { n: summary.creneaux.parSection }) : "",
      }),
      tab: "horaires",
      action: t("sl.recap.days.action"),
    },
    {
      done: summary.matieres.total > 0 && summary.matieres.sansNiveau === 0,
      title: t("sl.recap.subjects.title"),
      detail:
        summary.matieres.total === 0
          ? t("sl.recap.subjects.none")
          : t("sl.recap.subjects.detail", {
              n: summary.matieres.total,
              noLevel: summary.matieres.sansNiveau > 0 ? t("sl.recap.subjects.noLevel", { n: summary.matieres.sansNiveau }) : "",
            }),
      tab: "matieres",
      action: t("sl.recap.subjects.action"),
    },
    {
      done: summary.enseignants.total > 0,
      title: t("sl.recap.teachers.title"),
      detail:
        summary.enseignants.total === 0
          ? t("sl.recap.teachers.none")
          : t("sl.recap.teachers.detail", {
              active: summary.enseignants.actifs,
              total: summary.enseignants.total,
              noAssign: summary.enseignants.sansAffectation > 0 ? t("sl.recap.teachers.noAssign", { n: summary.enseignants.sansAffectation }) : "",
            }),
      tab: "enseignants",
      action: t("sl.recap.teachers.action"),
    },
    {
      done: summary.affectations.requises > 0 && summary.affectations.manquantes === 0,
      title: t("sl.recap.assign.title"),
      detail:
        summary.affectations.classes === 0
          ? t("sl.recap.assign.noClass")
          : summary.affectations.requises === 0
            ? t("sl.recap.assign.nothing")
            : t("sl.recap.assign.detail", {
                done: summary.affectations.classesCompletes,
                total: summary.affectations.classes,
                missing: summary.affectations.manquantes,
              }),
      tab: "affectations",
      action: t("sl.recap.assign.action"),
    },
    {
      done: summary.trimestres >= 3,
      title: t("sl.recap.terms.title"),
      detail: t("sl.recap.terms.detail", { n: summary.trimestres }),
      tab: "calendrier",
      action: t("sl.recap.calendar.action"),
    },
    {
      done: summary.calendrier.vacances + summary.calendrier.feries > 0,
      title: t("sl.recap.holidays.title"),
      detail: t("sl.recap.holidays.detail", { v: summary.calendrier.vacances, f: summary.calendrier.feries }),
      tab: "calendrier",
      action: t("sl.recap.calendar.action"),
    },
    {
      done: summary.salles > 0,
      title: t("sl.recap.rooms.title"),
      detail: summary.salles === 0 ? t("sl.recap.rooms.none") : t("sl.recap.rooms.detail", { n: summary.salles }),
      tab: "salles",
      action: t("sl.recap.rooms.action"),
    },
    {
      done: !!summary.pilote.classe && !!summary.pilote.enseignant,
      title: t("sl.recap.pilot.title"),
      detail: t("sl.recap.pilot.detail", {
        classe: summary.pilote.classe?.nom ?? t("sl.recap.pilot.classNone"),
        teacher: summary.pilote.enseignant ? `${summary.pilote.enseignant.prenom} ${summary.pilote.enseignant.nom}` : t("sl.recap.pilot.teacherNone"),
      }),
      tab: "recap",
      action: t("sl.recap.pilot.action"),
    },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{t("sl.recap.heading")}</h2>
            <p className={TAB_HINT}>
              {t("sl.recap.progress", { done: doneCount, total: items.length })}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <Select value={yearId} onChange={(e) => onYearChange(e.target.value)} aria-label={t("sl.recap.year")}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.libelle}
                  {y.statut === "ACTIVE" ? t("sl.recap.yearActive") : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.title}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-border p-3 ${
                item.done ? "border-l-success bg-success-soft/30" : "border-l-warning bg-warning-soft/30"
              }`}
            >
              <div className="flex items-start gap-3">
                {item.done ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" /> : <Circle size={20} className="mt-0.5 shrink-0 text-warning" />}
                <div>
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="text-sm text-ink-muted">{item.detail}</p>
                </div>
              </div>
              {item.tab !== "recap" && (
                <Button variant={item.done ? "secondary" : "primary"} onClick={() => onGo(item.tab)}>
                  {item.done ? t("sl.recap.edit") : item.action}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">{t("sl.recap.pilot.title")}</h3>
        <p className={`mb-3 ${TAB_HINT}`}>
          {t("sl.recap.pilot.hint")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("sl.recap.pilot.classLabel")}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("sl.recap.pilot.classNoneOption")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("sl.recap.pilot.teacherLabel")}>
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">{t("sl.recap.pilot.teacherNoneOption")}</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.prenom} {t.nom}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <SuccessMessage>{saved ? t("sl.recap.pilot.saved") : null}</SuccessMessage>
        <Button className="mt-3" onClick={() => void savePilot()}>
          {t("sl.common.save")}
        </Button>
      </Card>

      <Card>
        <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold text-ink">
          <FileText size={16} className="text-primary" /> {t("sl.recap.docs.title")}
        </h3>
        <p className="text-sm text-ink-muted">
          {t("sl.recap.docs.intro")}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-ink">
          <li>
            <Badge color="slate">{t("sl.recap.docs.badge")}</Badge> {t("sl.recap.docs.rules")}
          </li>
          <li>
            <Badge color="slate">{t("sl.recap.docs.badge")}</Badge> {t("sl.recap.docs.template")}
          </li>
        </ul>
      </Card>
    </div>
  );
}
