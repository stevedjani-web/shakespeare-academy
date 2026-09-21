"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, School, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { buildSection, type ExportColumn } from "@/lib/export";
import type { StudentByClassRow } from "@/lib/types";
import { Badge, Card, EmptyState, Input, PageTitle, Select, Spinner, StatCard } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";

const NO_CLASS = "Sans classe";

interface ClassGroup {
  key: string;
  classe: string;
  cycle: string;
  section: string;
  rows: StudentByClassRow[];
}

const COLUMNS: ExportColumn<StudentByClassRow & { rang: number }>[] = [
  { header: "N°", value: (r) => r.rang, kind: "number" },
  { header: "Matricule", value: (r) => r.matricule },
  { header: "Nom", value: (r) => r.nom },
  { header: "Prénom", value: (r) => r.prenom },
  { header: "Sexe", value: (r) => (r.sexe === "M" ? "Masculin" : "Féminin") },
  { header: "Date de naissance", value: (r) => formatDate(r.dateNaissance) },
  { header: "Responsable", value: (r) => r.responsable },
  { header: "Téléphone", value: (r) => r.telephoneResponsable },
];

function groupSection(group: ClassGroup) {
  return buildSection(
    group.classe,
    COLUMNS,
    group.rows.map((r, i) => ({ ...r, rang: i + 1 })),
  );
}

export default function StudentsByClassPage() {
  const [rows, setRows] = useState<StudentByClassRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [query, setQuery] = useState("");
  // Classes développées : tout est replié au départ pour que la page reste compacte.
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    void api.get<StudentByClassRow[]>("/reports/students-by-class").then((data) => {
      setRows(data);
      setLoaded(true);
    });
  }, []);

  const groups = useMemo<ClassGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, ClassGroup>();
    for (const r of rows) {
      if (q && !`${r.nom} ${r.prenom} ${r.matricule}`.toLowerCase().includes(q)) continue;
      const classe = r.classe || NO_CLASS;
      const key = `${r.section}|${r.cycle}|${classe}`;
      const group = map.get(key) ?? { key, classe, cycle: r.cycle, section: r.section, rows: [] };
      group.rows.push(r);
      map.set(key, group);
    }
    return Array.from(map.values());
  }, [rows, query]);

  const visibleGroups = classFilter ? groups.filter((g) => g.key === classFilter) : groups;
  const allClasses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const classe = r.classe || NO_CLASS;
      seen.set(`${r.section}|${r.cycle}|${classe}`, `${classe}${r.section ? ` (${r.section})` : ""}`);
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [rows]);

  const total = visibleGroups.reduce((n, g) => n + g.rows.length, 0);
  const boys = visibleGroups.reduce((n, g) => n + g.rows.filter((r) => r.sexe === "M").length, 0);
  const girls = total - boys;
  const exportSections = visibleGroups.map(groupSection);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow="Effectifs" subtitle="Liste nominative des élèves, regroupés par classe.">
          Élèves par classe
        </PageTitle>
        <ExportButtons
          fileName="eleves-par-classe"
          title="Liste des élèves par classe"
          sections={exportSections}
          disabled={!loaded}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Classes" value={visibleGroups.length} tone="primary" icon={<School size={18} />} />
        <StatCard label="Élèves" value={total} tone="success" icon={<Users size={18} />} />
        <StatCard label="Garçons" value={boys} tone="info" icon={<Users size={18} />} />
        <StatCard label="Filles" value={girls} tone="accent" icon={<Users size={18} />} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Toutes les classes</option>
            {allClasses.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-xs">
          <Input placeholder="Rechercher un élève…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {visibleGroups.length > 1 && (
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setOpen(new Set(visibleGroups.map((g) => g.key)))}
              className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
            >
              Tout développer
            </button>
            <button
              type="button"
              onClick={() => setOpen(new Set())}
              className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
            >
              Tout réduire
            </button>
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </div>
      ) : visibleGroups.length === 0 ? (
        <EmptyState icon={<School />} title="Aucun élève à afficher." description="Modifiez la recherche ou inscrivez un élève." />
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const gBoys = group.rows.filter((r) => r.sexe === "M").length;
            const noClass = group.classe === NO_CLASS;
            // Une recherche ou une seule classe choisie développe automatiquement ce qui est trouvé.
            const expanded = open.has(group.key) || !!query.trim() || visibleGroups.length === 1;
            return (
              <div
                key={group.key}
                className={`overflow-hidden rounded-2xl border border-border border-l-4 bg-surface shadow-[var(--shadow-soft)] ${
                  noClass ? "border-l-warning" : group.section.toLowerCase().startsWith("angl") ? "border-l-info" : "border-l-primary"
                }`}
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 bg-surface-muted/60 px-4 py-2.5 sm:px-5 ${
                    expanded ? "border-b border-border" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(group.key)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Réduire" : "Développer"} la classe ${group.classe}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary">
                      {expanded ? <Minus size={15} /> : <Plus size={15} />}
                    </span>
                    <h2 className="font-display text-lg font-semibold text-ink">{group.classe}</h2>
                    {group.section && <Badge color="primary">{group.section}</Badge>}
                    {group.cycle && <Badge color="slate">{group.cycle}</Badge>}
                    <Badge color="green">{group.rows.length} élève(s)</Badge>
                    <Badge color="blue">{gBoys} G</Badge>
                    <Badge color="accent">{group.rows.length - gBoys} F</Badge>
                  </button>
                  <ExportButtons
                    fileName={`classe-${group.classe}`}
                    title={`Classe ${group.classe}`}
                    sections={[groupSection(group)]}
                    subtitle={[group.section, group.cycle].filter(Boolean).join(" - ")}
                  />
                </div>
                {expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted">
                        <th className="px-4 py-2 sm:px-5">N°</th>
                        <th className="py-2 pr-4">Matricule</th>
                        <th className="py-2 pr-4">Élève</th>
                        <th className="py-2 pr-4">Sexe</th>
                        <th className="py-2 pr-4">Naissance</th>
                        <th className="py-2 pr-4">Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r, i) => (
                        <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                          <td className="px-4 py-2 text-ink-muted sm:px-5">{i + 1}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-ink-muted">{r.matricule}</td>
                          <td className="py-2 pr-4">
                            <Link href={`/eleves/${r.id}`} className="font-medium text-ink hover:underline">
                              {r.nom} {r.prenom}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge color={r.sexe === "M" ? "blue" : "accent"}>{r.sexe === "M" ? "M" : "F"}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-ink-muted">{formatDate(r.dateNaissance)}</td>
                          <td className="py-2 pr-4 text-ink-muted">
                            {r.responsable ? (
                              <>
                                {r.responsable}
                                {r.telephoneResponsable && <span className="block text-xs">{r.telephoneResponsable}</span>}
                              </>
                            ) : (
                              <span className="text-warning">À renseigner</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Card className="mt-5 text-xs text-ink-muted">
        Les exports Excel et PDF reprennent exactement les classes affichées (filtre et recherche compris) : un onglet ou
        une section par classe.
      </Card>
    </div>
  );
}
