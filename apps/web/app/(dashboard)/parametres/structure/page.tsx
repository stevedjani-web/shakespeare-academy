"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { AcademicYear, Class, Cycle, Level, Section } from "@/lib/types";
import { Badge, Button, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { BookOpen, Building2, GraduationCap, Layers } from "lucide-react";

// Structure académique : Section > Cycle > Niveau > Classe, présentée en arbre replié. Un + ouvre
// chaque élément et montre ce qu'il contient, avec le formulaire pour y ajouter un enfant. Les classes
// dépendent de l'année scolaire choisie en haut de page : elles sont chargées à l'ouverture d'un niveau.

function InlineCreateForm({
  codePlaceholder,
  uppercaseCode,
  submitLabel,
  onCreate,
}: {
  codePlaceholder: string;
  uppercaseCode: boolean;
  submitLabel: string;
  onCreate: (dto: { code: string; nom: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [nom, setNom] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ code, nom });
        setCode("");
        setNom("");
      }}
      className="mt-2 flex flex-wrap gap-2"
    >
      <Input
        placeholder={codePlaceholder}
        required
        value={code}
        onChange={(e) => setCode(uppercaseCode ? e.target.value.toUpperCase() : e.target.value)}
        className="w-36"
      />
      <Input placeholder="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} className="min-w-0 flex-1" />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function ClassCreateForm({ onCreate }: { onCreate: (dto: { nom: string; capacite?: number }) => void }) {
  const [nom, setNom] = useState("");
  const [capacite, setCapacite] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ nom, capacite: capacite ? Number(capacite) : undefined });
        setNom("");
        setCapacite("");
      }}
      className="mt-2 flex flex-wrap gap-2"
    >
      <Input placeholder="Nom (ex. CM2 A)" required value={nom} onChange={(e) => setNom(e.target.value)} className="min-w-0 flex-1" />
      <Input
        placeholder="Capacité"
        type="number"
        min={1}
        value={capacite}
        onChange={(e) => setCapacite(e.target.value)}
        className="w-28"
      />
      <Button type="submit">Ajouter la classe</Button>
    </form>
  );
}

export default function AcademicStructurePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("ACADEMIC_STRUCTURE_MANAGE");
  const expand = useExpanded();

  const [sections, setSections] = useState<Section[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  // Classes de l'année choisie, par niveau : chargées quand le niveau est ouvert.
  const [classesByLevel, setClassesByLevel] = useState<Record<string, Class[]>>({});
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
    setSelectedYearId((current) => current || y.find((year) => year.statut === "ACTIVE")?.id || y[0]?.id || "");
  }

  useEffect(() => {
    void loadAll().catch((err) => setError(isApiError(err) ? err.message : "Une erreur est survenue."));
  }, []);

  async function loadClassesFor(levelId: string, yearId: string) {
    if (!levelId || !yearId) return;
    const c = await api.get<Class[]>(`/classes?levelId=${levelId}&academicYearId=${yearId}`);
    setClassesByLevel((prev) => ({ ...prev, [levelId]: c }));
  }

  // Changer d'année, ou ouvrir un niveau, recharge ses classes.
  const openLevelKey = levels
    .filter((l) => expand.isOpen(l.id))
    .map((l) => l.id)
    .join(",");
  useEffect(() => {
    setClassesByLevel({});
  }, [selectedYearId]);
  useEffect(() => {
    if (!selectedYearId || !openLevelKey) return;
    for (const id of openLevelKey.split(",")) {
      if (!(id in classesByLevel)) void loadClassesFor(id, selectedYearId).catch(() => {});
    }
  }, [openLevelKey, selectedYearId, classesByLevel]);

  async function submitOrShowError<T>(action: () => Promise<T>, after?: (created: T) => void) {
    setError(null);
    try {
      const created = await action();
      await loadAll();
      after?.(created);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  const allIds = [...sections.map((s) => s.id), ...cycles.map((c) => c.id), ...levels.map((l) => l.id)];

  return (
    <div>
      <PageTitle
        subtitle="Section → Cycle → Niveau → Classe. Ouvrez un élément avec + pour voir son contenu."
        helpId="parametres-structure"
      >
        Structure académique
      </PageTitle>
      <ErrorMessage>{error}</ErrorMessage>

      <div className="mb-4 mt-4 flex flex-wrap items-end gap-4">
        {years.length > 0 && (
          <div className="w-full max-w-xs">
            <Field label="Année scolaire (pour les classes)">
              <Select value={selectedYearId} onChange={(e) => setSelectedYearId(e.target.value)}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.libelle}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <div className="pb-1">
          <ExpandAll count={allIds.length} onOpenAll={() => expand.openAll(allIds)} onCloseAll={expand.closeAll} />
        </div>
      </div>

      <div className="space-y-2">
        {sections.length === 0 && <p className="py-4 text-sm text-ink-muted">Aucune section.</p>}
        {sections.map((section) => {
          const sectionCycles = cycles.filter((c) => c.sectionId === section.id);
          const isOpen = expand.isOpen(section.id);
          return (
            <div key={section.id} className="rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-center gap-2.5">
                <ExpandButton open={isOpen} onClick={() => expand.toggle(section.id)} label={section.nom} />
                <Building2 size={16} className="text-primary" />
                <span className="font-medium text-ink">{section.nom}</span>
                <span className="text-xs text-ink-muted">({section.code})</span>
                <Badge color="slate">{sectionCycles.length} cycle(s)</Badge>
              </div>

              {isOpen && (
                <div className="ml-3 mt-3 space-y-2 border-l border-border pl-4 sm:ml-5">
                  {sectionCycles.length === 0 && <p className="text-sm text-ink-muted">Aucun cycle.</p>}
                  {sectionCycles.map((cycle) => {
                    const cycleLevels = levels.filter((l) => l.cycleId === cycle.id);
                    const cycleOpen = expand.isOpen(cycle.id);
                    return (
                      <div key={cycle.id} className="rounded-xl bg-surface-muted/50 p-2.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <ExpandButton open={cycleOpen} onClick={() => expand.toggle(cycle.id)} label={cycle.nom} />
                          <BookOpen size={15} className="text-primary" />
                          <span className="text-sm font-medium text-ink">{cycle.nom}</span>
                          <span className="text-xs text-ink-muted">({cycle.code})</span>
                          <Badge color="slate">{cycleLevels.length} niveau(x)</Badge>
                        </div>

                        {cycleOpen && (
                          <div className="ml-3 mt-2.5 space-y-2 border-l border-border pl-4 sm:ml-5">
                            {cycleLevels.length === 0 && <p className="text-sm text-ink-muted">Aucun niveau.</p>}
                            {cycleLevels.map((level) => {
                              const levelOpen = expand.isOpen(level.id);
                              const levelClasses = classesByLevel[level.id];
                              return (
                                <div key={level.id} className="rounded-xl bg-surface p-2.5 ring-1 ring-border">
                                  <div className="flex flex-wrap items-center gap-2.5">
                                    <ExpandButton open={levelOpen} onClick={() => expand.toggle(level.id)} label={level.nom} />
                                    <Layers size={15} className="text-primary" />
                                    <span className="text-sm font-medium text-ink">{level.nom}</span>
                                    {levelClasses && <Badge color="slate">{levelClasses.length} classe(s)</Badge>}
                                  </div>

                                  {levelOpen && (
                                    <div className="ml-3 mt-2.5 border-l border-border pl-4 sm:ml-5">
                                      {years.length === 0 ? (
                                        <p className="text-sm text-ink-muted">
                                          Aucune année scolaire créée. Créez-en une dans{" "}
                                          <Link href="/parametres/annees" className="font-medium text-primary hover:underline">
                                            Années scolaires
                                          </Link>{" "}
                                          avant de pouvoir ajouter une classe.
                                        </p>
                                      ) : (
                                        <>
                                          <ul className="space-y-1">
                                            {(levelClasses ?? []).map((c) => (
                                              <li key={c.id} className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-1.5 text-sm text-ink">
                                                <GraduationCap size={14} className="text-primary" />
                                                {c.nom}
                                                {c.capacite && <span className="text-ink-muted">, capacité {c.capacite}</span>}
                                              </li>
                                            ))}
                                            {levelClasses && levelClasses.length === 0 && (
                                              <li className="py-1 text-sm text-ink-muted">Aucune classe pour cette année.</li>
                                            )}
                                          </ul>
                                          {canManage && selectedYearId && (
                                            <ClassCreateForm
                                              onCreate={(dto) =>
                                                void submitOrShowError(
                                                  () => api.post("/classes", { ...dto, levelId: level.id, academicYearId: selectedYearId }),
                                                  () => void loadClassesFor(level.id, selectedYearId),
                                                )
                                              }
                                            />
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {canManage && (
                              <InlineCreateForm
                                codePlaceholder="Code (ex. CM2, 6e)"
                                uppercaseCode={false}
                                submitLabel="Ajouter le niveau"
                                onCreate={(dto) =>
                                  void submitOrShowError(
                                    () => api.post<Level>("/levels", { ...dto, cycleId: cycle.id }),
                                    (created) => expand.openAll([...expand.open, created.id]),
                                  )
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canManage && (
                    <InlineCreateForm
                      codePlaceholder="CODE"
                      uppercaseCode
                      submitLabel="Ajouter le cycle"
                      onCreate={(dto) =>
                        void submitOrShowError(
                          () => api.post<Cycle>("/cycles", { ...dto, sectionId: section.id }),
                          (created) => expand.openAll([...expand.open, created.id]),
                        )
                      }
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canManage && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-soft)]">
          <p className="text-sm font-semibold text-ink">Ajouter une section</p>
          <InlineCreateForm
            codePlaceholder="CODE"
            uppercaseCode
            submitLabel="Ajouter la section"
            onCreate={(dto) =>
              void submitOrShowError(
                () => api.post<Section>("/sections", dto),
                (created) => expand.openAll([...expand.open, created.id]),
              )
            }
          />
        </div>
      )}
    </div>
  );
}
