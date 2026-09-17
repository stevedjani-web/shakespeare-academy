"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { AcademicYear, Class, Cycle, Level, Section } from "@/lib/types";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import { BookOpen, Building2, GraduationCap, Layers, type LucideIcon } from "lucide-react";

function ColumnTitle({ icon: Icon, step, children }: { icon: LucideIcon; step: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
        {step}
      </span>
      <Icon size={16} className="text-primary" />
      {children}
    </h2>
  );
}

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

  function selectSection(id: string) {
    setSelectedSectionId(id);
    setSelectedCycleId("");
    setSelectedLevelId("");
  }
  function selectCycle(id: string) {
    setSelectedCycleId(id);
    setSelectedLevelId("");
  }

  // Après une création (section/cycle/niveau/classe), `loadAll()` ne rafraîchit jamais `classes`
  // lui-même : cette liste dépend de selectedLevelId/selectedYearId, qui ne changent pas suite à
  // un simple ajout. Sans ce deuxième appel, une classe fraîchement créée restait invisible tant
  // qu'aucune sélection n'était re-déclenchée manuellement (bug trouvé en vérifiant dans le navigateur).
  //
  // `onSelected` : sans sélection automatique de l'élément fraîchement créé, rien ne se passait
  // visuellement après avoir ajouté une section/un cycle/un niveau — la colonne suivante restait
  // sur "Sélectionnez une section/un cycle/un niveau", donnant l'impression que la création avait
  // échoué alors qu'elle avait réussi (bug réel signalé : "on ne peut pas ajouter un cycle, un
  // niveau et une classe"). L'utilisateur doit pouvoir enchaîner section → cycle → niveau → classe
  // sans avoir à deviner qu'il faut recliquer sur l'élément qu'il vient de créer.
  async function submitOrShowError<T>(action: () => Promise<T>, onSelected?: (created: T) => void) {
    setError(null);
    try {
      const created = await action();
      await loadAll();
      await loadClasses();
      onSelected?.(created);
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
          onSelect={selectSection}
          canManage={canManage}
          onCreate={(dto) =>
            submitOrShowError(() => api.post<Section>("/sections", dto), (created) => selectSection(created.id))
          }
        />

        <CycleColumn
          section={sections.find((s) => s.id === selectedSectionId) ?? null}
          cycles={cyclesForSection}
          selectedCycleId={selectedCycleId}
          onSelect={selectCycle}
          canManage={canManage}
          onCreate={(dto) =>
            submitOrShowError(
              () => api.post<Cycle>("/cycles", { ...dto, sectionId: selectedSectionId }),
              (created) => selectCycle(created.id),
            )
          }
        />

        <LevelColumn
          cycle={cycles.find((c) => c.id === selectedCycleId) ?? null}
          levels={levelsForCycle}
          selectedLevelId={selectedLevelId}
          onSelect={setSelectedLevelId}
          canManage={canManage}
          onCreate={(dto) =>
            submitOrShowError(
              () => api.post<Level>("/levels", { ...dto, cycleId: selectedCycleId }),
              (created) => setSelectedLevelId(created.id),
            )
          }
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
      <ColumnTitle icon={Building2} step={1}>
        Sections
      </ColumnTitle>
      <ul className="mb-4 space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                selectedSectionId === s.id
                  ? "border-primary/30 bg-primary-soft font-medium text-primary"
                  : "border-transparent hover:bg-surface-muted"
              }`}
            >
              {s.nom} <span className="text-ink-muted">({s.code})</span>
            </button>
          </li>
        ))}
        {sections.length === 0 && <li className="py-4 text-sm text-ink-muted">Aucune section.</li>}
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
      <ColumnTitle icon={BookOpen} step={2}>
        Cycles {section && <span className="font-normal text-ink-muted">— {section.nom}</span>}
      </ColumnTitle>
      {!section ? (
        <p className="text-sm text-ink-muted">Sélectionnez une section.</p>
      ) : (
        <>
          <ul className="mb-4 space-y-1">
            {cycles.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    selectedCycleId === c.id
                      ? "border-primary/30 bg-primary-soft font-medium text-primary"
                      : "border-transparent hover:bg-surface-muted"
                  }`}
                >
                  {c.nom} <span className="text-ink-muted">({c.code})</span>
                </button>
              </li>
            ))}
            {cycles.length === 0 && <li className="py-4 text-sm text-ink-muted">Aucun cycle.</li>}
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
      <ColumnTitle icon={Layers} step={3}>
        Niveaux {cycle && <span className="font-normal text-ink-muted">— {cycle.nom}</span>}
      </ColumnTitle>
      {!cycle ? (
        <p className="text-sm text-ink-muted">Sélectionnez un cycle.</p>
      ) : (
        <>
          <ul className="mb-4 space-y-1">
            {levels.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => onSelect(l.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    selectedLevelId === l.id
                      ? "border-primary/30 bg-primary-soft font-medium text-primary"
                      : "border-transparent hover:bg-surface-muted"
                  }`}
                >
                  {l.nom}
                </button>
              </li>
            ))}
            {levels.length === 0 && <li className="py-4 text-sm text-ink-muted">Aucun niveau.</li>}
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
      <ColumnTitle icon={GraduationCap} step={4}>
        Classes {level && <span className="font-normal text-ink-muted">— {level.nom}</span>}
      </ColumnTitle>
      {!level ? (
        <p className="text-sm text-ink-muted">Sélectionnez un niveau.</p>
      ) : years.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Aucune année scolaire créée — créez-en une dans{" "}
          <Link href="/parametres/annees" className="font-medium text-primary hover:underline">
            Années scolaires
          </Link>{" "}
          avant de pouvoir ajouter une classe.
        </p>
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
          <ul className="my-4 space-y-1">
            {classes.map((c) => (
              <li key={c.id} className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink">
                {c.nom} {c.capacite && <span className="text-ink-muted">— capacité {c.capacite}</span>}
              </li>
            ))}
            {classes.length === 0 && <li className="py-4 text-sm text-ink-muted">Aucune classe pour cette année.</li>}
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
