"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { AcademicYear, Class, ClassAssignments, Teacher } from "@/lib/types";
import { Badge, Card, EmptyState, ErrorMessage, Field, Select } from "@/components/ui";
import { ListChecks } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/** Affectations : pour une classe, qui enseigne chaque matière de son niveau (un seul enseignant, RV01). */
export function AffectationsTab({
  years,
  activeYear,
  levelLabel,
  onChanged,
}: {
  years: AcademicYear[];
  activeYear: AcademicYear | null;
  levelLabel: (id: string) => string;
  onChanged: () => void;
}) {
  const { t: tr } = useI18n();
  const [yearId, setYearId] = useState("");
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState("");
  const [grid, setGrid] = useState<ClassAssignments | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!yearId && activeYear) setYearId(activeYear.id);
  }, [activeYear, yearId]);

  useEffect(() => {
    void api.get<Teacher[]>("/teachers").then(setTeachers).catch((e) => setError(describeError(e)));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setClassId("");
    setGrid(null);
    void api
      .get<Class[]>(`/classes?academicYearId=${yearId}`)
      .then(setClasses)
      .catch((e) => setError(describeError(e)));
  }, [yearId]);

  async function loadGrid(id: string) {
    setGrid(await api.get<ClassAssignments>(`/assignments/by-class/${id}`));
  }

  useEffect(() => {
    if (!classId) {
      setGrid(null);
      return;
    }
    void loadGrid(classId).catch((e) => setError(describeError(e)));
  }, [classId]);

  async function setTeacher(subjectId: string, teacherId: string, existingId: string | null) {
    setError(null);
    setBusy(subjectId);
    try {
      if (!teacherId && existingId) {
        await api.delete(`/assignments/${existingId}`);
      } else if (teacherId && existingId) {
        await api.patch(`/assignments/${existingId}`, { teacherId });
      } else if (teacherId) {
        await api.post("/assignments", { classId, subjectId, teacherId });
      }
      await loadGrid(classId);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  const activeTeachers = teachers.filter((t) => t.statut === "ACTIF");
  const done = grid?.matieres.filter((m) => m.assignment).length ?? 0;

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-ink">{tr("sl.assign.title")}</h2>
      <p className={`mb-3 ${TAB_HINT}`}>
        {tr("sl.assign.hint")}
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label={tr("sl.assign.year")}>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.libelle}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("sl.assign.class")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{tr("sl.assign.chooseClass")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({levelLabel(c.levelId)})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ErrorMessage>{error}</ErrorMessage>

      {!grid ? (
        <EmptyState icon={<ListChecks />} title={tr("sl.assign.emptyPick.title")} description={tr("sl.assign.emptyPick.description")} />
      ) : grid.matieres.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={tr("sl.assign.emptyLevel.title")}
          description={tr("sl.assign.emptyLevel.description")}
        />
      ) : (
        <>
          <p className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
            <Badge color={done === grid.matieres.length ? "green" : "orange"}>
              {tr("sl.assign.doneCount", { done, total: grid.matieres.length })}
            </Badge>
          </p>
          <ul className="space-y-2">
            {grid.matieres.map((m) => (
              <li key={m.subject.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="font-medium text-ink">{m.subject.nom}</p>
                  <p className="text-xs text-ink-muted">
                    {m.subject.code}
                    {m.minutesParSemaine ? ` · ${tr("sl.assign.minPerWeek", { n: m.minutesParSemaine })}` : ""}
                  </p>
                </div>
                <div className="w-full max-w-xs">
                  <Select
                    value={m.assignment?.teacherId ?? ""}
                    disabled={busy === m.subject.id}
                    onChange={(e) => void setTeacher(m.subject.id, e.target.value, m.assignment?.id ?? null)}
                    aria-label={tr("sl.assign.teacherOf", { subject: m.subject.nom })}
                  >
                    <option value="">{tr("sl.assign.noTeacher")}</option>
                    {activeTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.prenom} {t.nom}
                      </option>
                    ))}
                    {m.assignment && !activeTeachers.some((t) => t.id === m.assignment!.teacherId) && (
                      <option value={m.assignment.teacherId}>
                        {m.assignment.teacher.prenom} {m.assignment.teacher.nom} {tr("sl.assign.inactive")}
                      </option>
                    )}
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
