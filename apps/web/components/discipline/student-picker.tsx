"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Field, Select } from "@/components/ui";
import type { ClassRef, StudentRef } from "@/lib/discipline";
import { studentName } from "@/lib/discipline";

/**
 * Choix d'un élève en deux temps, classe puis élève : un enseignant n'a pas le droit de lire la liste des élèves de
 * l'école, il n'obtient que ses classes (le serveur applique cette portée, ce choix n'en est que le reflet).
 */
export function StudentPicker({ value, onChange }: { value: string; onChange: (studentId: string) => void }) {
  const { t } = useI18n();
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentRef[]>([]);

  useEffect(() => {
    void api.get<ClassRef[]>("/discipline/my-classes").then(setClasses).catch(() => setClasses([]));
  }, []);

  function pickClass(id: string) {
    setClassId(id);
    onChange("");
    setStudents([]);
    if (id) void api.get<StudentRef[]>(`/discipline/classes/${id}/students`).then(setStudents).catch(() => setStudents([]));
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("acd.disc.pick.class")}>
        <Select value={classId} onChange={(e) => pickClass(e.target.value)}>
          <option value="">{t("acd.disc.pick.chooseClass")}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("acd.disc.pick.student")}>
        <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={!classId}>
          <option value="">{classId ? t("acd.disc.pick.chooseStudent") : t("acd.disc.pick.classFirst")}</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {studentName(s)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
