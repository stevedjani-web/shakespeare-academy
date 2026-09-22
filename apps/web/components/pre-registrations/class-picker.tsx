"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Field, Select } from "@/components/ui";
import type { AcademicYear, Class, Cycle, Level, Section } from "@/lib/types";

/**
 * Choix de la classe réelle à l'acceptation : Année → Section → Cycle → Niveau → Classe, restreint aux années non
 * clôturées (RG01) — même cascade que l'assistant d'inscription du dashboard.
 */
export function ClassPicker({ initialLevelId, onChange }: { initialLevelId?: string | null; onChange: (classId: string) => void }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  const [yearId, setYearId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");

  useEffect(() => {
    void (async () => {
      const [y, s, c, l] = await Promise.all([
        api.get<AcademicYear[]>("/academic-years"),
        api.get<Section[]>("/sections"),
        api.get<Cycle[]>("/cycles"),
        api.get<Level[]>("/levels"),
      ]);
      setYears(y.filter((year) => year.statut !== "CLOTUREE"));
      setSections(s);
      setCycles(c);
      setLevels(l);
      const active = y.find((year) => year.statut === "ACTIVE");
      if (active) setYearId(active.id);
      if (initialLevelId) {
        const lvl = l.find((x) => x.id === initialLevelId);
        if (lvl) {
          setLevelId(lvl.id);
          const cyc = c.find((x) => x.id === lvl.cycleId);
          if (cyc) {
            setCycleId(cyc.id);
            setSectionId(cyc.sectionId);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!levelId || !yearId) {
      setClasses([]);
      return;
    }
    void api.get<Class[]>(`/classes?levelId=${levelId}&academicYearId=${yearId}`).then(setClasses);
  }, [levelId, yearId]);

  useEffect(() => {
    setClassId("");
    onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, yearId]);

  const cyclesForSection = cycles.filter((c) => c.sectionId === sectionId);
  const levelsForCycle = levels.filter((l) => l.cycleId === cycleId);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Année scolaire">
        <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
          <option value="">Choisir…</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.libelle} {y.statut === "ACTIVE" ? "(active)" : "(brouillon)"}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Section">
        <Select
          value={sectionId}
          onChange={(e) => {
            setSectionId(e.target.value);
            setCycleId("");
            setLevelId("");
          }}
        >
          <option value="">Choisir…</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Cycle">
        <Select
          value={cycleId}
          onChange={(e) => {
            setCycleId(e.target.value);
            setLevelId("");
          }}
          disabled={!sectionId}
        >
          <option value="">Choisir…</option>
          {cyclesForSection.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Niveau">
        <Select value={levelId} onChange={(e) => setLevelId(e.target.value)} disabled={!cycleId}>
          <option value="">Choisir…</option>
          {levelsForCycle.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Classe">
        <Select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            onChange(e.target.value);
          }}
          disabled={!levelId}
        >
          <option value="">Choisir…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
