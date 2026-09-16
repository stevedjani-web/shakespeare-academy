"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { AcademicYear, Class, Cycle, Level, Section } from "@/lib/types";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";

export default function AcademicStructurePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("ACADEMIC_STRUCTURE_MANAGE");

  const [sections, setSections] = useState<Section[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [selectedLevelId, setSelectedLevelId] = useState<string>("");
  const [selectedYearId, setSelectedYearId] = useState<string>("");

  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [s, c, l, y] = await Promise.all([
      api.get<Section[]>("/sections"),
      api.get<Cycle[]>("/cycles"),
      api.get<Level[]>("/levels"),
      api.get<AcademicYear[]>("/academic-years"),
    ]);
    setSections(s);
    setCycles(c);
    setLevels(l);
    setYears(y);
    if (!selectedYearId && y.length > 0) {
      setSelectedYearId(y.find((year) => year.statut === "ACTIVE")?.id ?? y[0].id);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClasses() {
    if (!selectedLevelId || !selectedYearId) {
      setClasses([]);
      return;
    }
    const c = await api.get<Class[]>(`/classes?levelId=${selectedLevelId}&academicYearId=${selectedYearId}`);
    setClasses(c);
  }

  useEffect(() => {
    void loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevelId, selectedYearId]);

  const cyclesForSection = useMemo(
    () => cycles.filter((c) => c.sectionId === selectedSectionId),
    [cycles, selectedSectionId],
  );
  const levelsForCycle = useMemo(() => levels.filter((l) => l.cycleId === selectedCycleId), [levels, selectedCycleId]);

  // Après une création (section/cycle/niveau/classe), `loadAll()` ne rafraîchit jamais `classes`
  // lui-même : cette liste dépend de selectedLevelId/selectedYearId, qui ne changent pas suite à
  // un simple ajout. Sans ce deuxième appel, une classe fraîchement créée restait invisible tant
  // qu'aucune sélection n'était re-déclenchée manuellement (bug trouvé en vérifiant dans le navigateur).
  async function submitOrShowError(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await loadAll();
      await loadClasses();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  return (
    <div>
      <PageTitle subtitle="Section → Cycle → Niveau → Classe.">Structure académique</PageTitle>
      <ErrorMessage>{error}</ErrorMessage>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <SectionColumn
          sections={sections}
          selectedSectionId={selectedSectionId}
          onSelect={(id) => {
            setSelectedSectionId(id);
            setSelectedCycleId("");
            setSelectedLevelId("");
          }}
          canManage={canManage}
          onCreate={(dto) => submitOrShowError(() => api.post("/sections", dto))}
        />

        <CycleColumn
          section={sections.find((s) => s.id === selectedSectionId) ?? null}
          cycles={cyclesForSection}
          selectedCycleId={selectedCycleId}
          onSelect={(id) => {
            setSelectedCycleId(id);
            setSelectedLevelId("");
          }}
          canManage={canManage}
          onCreate={(dto) => submitOrShowError(() => api.post("/cycles", { ...dto, sectionId: selectedSectionId }))}
        />

        <LevelColumn
          cycle={cycles.find((c) => c.id === selectedCycleId) ?? null}
          levels={levelsForCycle}
          selectedLevelId={selectedLevelId}
          onSelect={setSelectedLevelId}
          canManage={canManage}
          onCreate={(dto) => submitOrShowError(() => api.post("/levels", { ...dto, cycleId: selectedCycleId }))}
        />

        <ClassColumn
          level={levels.find((l) => l.id === selectedLevelId) ?? null}
          years={years}
          selectedYearId={selectedYearId}
          onSelectYear={setSelectedYearId}
          classes={classes}
          canManage={canManage}
          onCreate={(dto) =>
            submitOrShowError(() =>
              api.post("/classes", { ...dto, levelId: selectedLevelId, academicYearId: selectedYearId }),
            )
          }
        />
      </div>
    </div>
  );
}

function SectionColumn({
  sections,
  selectedSectionId,
  onSelect,
  canManage,
  onCreate,
}: {
  sections: Section[];
  selectedSectionId: string;
  onSelect: (id: string) => void;
  canManage: boolean;
  onCreate: (dto: { code: string; nom: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [nom, setNom] = useState("");
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">1. Sections</h2>
      <ul className="mb-4 divide-y divide-slate-100">
        {sections.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.id)}
              className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50 ${
                selectedSectionId === s.id ? "bg-slate-100 font-medium" : ""
              }`}
            >
              {s.nom} <span className="text-slate-400">({s.code})</span>
            </button>
          </li>
        ))}
        {sections.length === 0 && <li className="py-4 text-sm text-slate-400">Aucune section.</li>}
      </ul>
      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ code, nom });
            setCode("");
            setNom("");
          }}
          className="flex gap-2"
        >
          <Input placeholder="CODE" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Input placeholder="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
          <Button type="submit">Ajouter</Button>
        </form>
      )}
    </Card>
  );
}

function CycleColumn({
  section,
  cycles,
  selectedCycleId,
  onSelect,
  canManage,
  onCreate,
}: {
  section: Section | null;
  cycles: Cycle[];
  selectedCycleId: string;
  onSelect: (id: string) => void;
  canManage: boolean;
  onCreate: (dto: { code: string; nom: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [nom, setNom] = useState("");
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">
        2. Cycles {section && <span className="font-normal text-slate-400">— {section.nom}</span>}
      </h2>
      {!section ? (
        <p className="text-sm text-slate-400">Sélectionnez une section.</p>
      ) : (
        <>
          <ul className="mb-4 divide-y divide-slate-100">
            {cycles.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50 ${
                    selectedCycleId === c.id ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  {c.nom} <span className="text-slate-400">({c.code})</span>
                </button>
              </li>
            ))}
            {cycles.length === 0 && <li className="py-4 text-sm text-slate-400">Aucun cycle.</li>}
          </ul>
          {canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreate({ code, nom });
                setCode("");
                setNom("");
              }}
              className="flex gap-2"
            >
              <Input placeholder="CODE" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <Input placeholder="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
              <Button type="submit">Ajouter</Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

function LevelColumn({
  cycle,
  levels,
  selectedLevelId,
  onSelect,
  canManage,
  onCreate,
}: {
  cycle: Cycle | null;
  levels: Level[];
  selectedLevelId: string;
  onSelect: (id: string) => void;
  canManage: boolean;
  onCreate: (dto: { code: string; nom: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [nom, setNom] = useState("");
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">
        3. Niveaux {cycle && <span className="font-normal text-slate-400">— {cycle.nom}</span>}
      </h2>
      {!cycle ? (
        <p className="text-sm text-slate-400">Sélectionnez un cycle.</p>
      ) : (
        <>
          <ul className="mb-4 divide-y divide-slate-100">
            {levels.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => onSelect(l.id)}
                  className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50 ${
                    selectedLevelId === l.id ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  {l.nom}
                </button>
              </li>
            ))}
            {levels.length === 0 && <li className="py-4 text-sm text-slate-400">Aucun niveau.</li>}
          </ul>
          {canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreate({ code, nom });
                setCode("");
                setNom("");
              }}
              className="flex gap-2"
            >
              <Input placeholder="Code (ex. CM2, 6e)" required value={code} onChange={(e) => setCode(e.target.value)} />
              <Input placeholder="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
              <Button type="submit">Ajouter</Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

function ClassColumn({
  level,
  years,
  selectedYearId,
  onSelectYear,
  classes,
  canManage,
  onCreate,
}: {
  level: Level | null;
  years: AcademicYear[];
  selectedYearId: string;
  onSelectYear: (id: string) => void;
  classes: Class[];
  canManage: boolean;
  onCreate: (dto: { nom: string; capacite?: number }) => void;
}) {
  const [nom, setNom] = useState("");
  const [capacite, setCapacite] = useState("");
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">
        4. Classes {level && <span className="font-normal text-slate-400">— {level.nom}</span>}
      </h2>
      {!level ? (
        <p className="text-sm text-slate-400">Sélectionnez un niveau.</p>
      ) : (
        <>
          <Field label="Année scolaire">
            <Select value={selectedYearId} onChange={(e) => onSelectYear(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.libelle}
                </option>
              ))}
            </Select>
          </Field>
          <ul className="my-4 divide-y divide-slate-100">
            {classes.map((c) => (
              <li key={c.id} className="py-2 text-sm">
                {c.nom} {c.capacite && <span className="text-slate-400">— capacité {c.capacite}</span>}
              </li>
            ))}
            {classes.length === 0 && <li className="py-4 text-sm text-slate-400">Aucune classe pour cette année.</li>}
          </ul>
          {canManage && selectedYearId && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreate({ nom, capacite: capacite ? Number(capacite) : undefined });
                setNom("");
                setCapacite("");
              }}
              className="flex gap-2"
            >
              <Input placeholder="Nom (ex. CM2 A)" required value={nom} onChange={(e) => setNom(e.target.value)} />
              <Input
                placeholder="Capacité"
                type="number"
                min={1}
                value={capacite}
                onChange={(e) => setCapacite(e.target.value)}
                className="w-28"
              />
              <Button type="submit">Ajouter</Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
