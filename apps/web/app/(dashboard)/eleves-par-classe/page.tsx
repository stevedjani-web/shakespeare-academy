"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, School, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey, MessageParams } from "@/lib/i18n";
import { buildSection, type ExportColumn } from "@/lib/export";
import type { StudentByClassRow } from "@/lib/types";
import { Badge, Card, EmptyState, Input, PageTitle, Select, Spinner, StatCard } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";

type Translate = (key: MessageKey, params?: MessageParams) => string;

// Regroupement des élèves sans classe : chaîne vide (jamais un texte traduit, la langue peut changer sans rechargement).
const NO_CLASS = "";

interface ClassGroup {
  key: string;
  classe: string;
  cycle: string;
  section: string;
  rows: StudentByClassRow[];
}

function columns(t: Translate): ExportColumn<StudentByClassRow & { rang: number }>[] {
  return [
    { header: t("stu.bycls.colNo"), value: (r) => r.rang, kind: "number" },
    { header: t("stu.bycls.colStudentNumber"), value: (r) => r.matricule },
    { header: t("stu.bycls.colSurname"), value: (r) => r.nom },
    { header: t("stu.bycls.colFirstName"), value: (r) => r.prenom },
    { header: t("stu.bycls.colSex"), value: (r) => (r.sexe === "M" ? t("stu.sexM") : t("stu.sexF")) },
    { header: t("stu.bycls.colBirth"), value: (r) => formatDate(r.dateNaissance) },
    { header: t("stu.bycls.colGuardian"), value: (r) => r.responsable },
    { header: t("stu.bycls.colPhone"), value: (r) => r.telephoneResponsable },
  ];
}

function groupName(group: ClassGroup, t: Translate): string {
  return group.classe || t("stu.bycls.noClass");
}

function groupSection(group: ClassGroup, t: Translate) {
  return buildSection(
    groupName(group, t),
    columns(t),
    group.rows.map((r, i) => ({ ...r, rang: i + 1 })),
  );
}

export default function StudentsByClassPage() {
  const { t } = useI18n();
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
      seen.set(`${r.section}|${r.cycle}|${classe}`, `${classe || t("stu.bycls.noClass")}${r.section ? ` (${r.section})` : ""}`);
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [rows, t]);

  const total = visibleGroups.reduce((n, g) => n + g.rows.length, 0);
  const boys = visibleGroups.reduce((n, g) => n + g.rows.filter((r) => r.sexe === "M").length, 0);
  const girls = total - boys;
  const exportSections = visibleGroups.map((g) => groupSection(g, t));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow={t("stu.bycls.eyebrow")} subtitle={t("stu.bycls.subtitle")} helpId="eleves-par-classe">
          {t("stu.bycls.title")}
        </PageTitle>
        <ExportButtons
          fileName={t("stu.bycls.exportFile")}
          title={t("stu.bycls.exportTitle")}
          sections={exportSections}
          disabled={!loaded}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("stu.bycls.statClasses")} value={visibleGroups.length} tone="primary" icon={<School size={18} />} />
        <StatCard label={t("stu.bycls.statStudents")} value={total} tone="success" icon={<Users size={18} />} />
        <StatCard label={t("stu.bycls.statBoys")} value={boys} tone="info" icon={<Users size={18} />} />
        <StatCard label={t("stu.bycls.statGirls")} value={girls} tone="accent" icon={<Users size={18} />} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">{t("stu.bycls.allClasses")}</option>
            {allClasses.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-xs">
          <Input placeholder={t("stu.bycls.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {visibleGroups.length > 1 && (
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setOpen(new Set(visibleGroups.map((g) => g.key)))}
              className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
            >
              {t("stu.expandAll")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(new Set())}
              className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
            >
              {t("stu.collapseAll")}
            </button>
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner /> {t("stu.bycls.loading")}
        </div>
      ) : visibleGroups.length === 0 ? (
        <EmptyState icon={<School />} title={t("stu.bycls.emptyTitle")} description={t("stu.bycls.emptyDesc")} />
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const gBoys = group.rows.filter((r) => r.sexe === "M").length;
            const noClass = group.classe === NO_CLASS;
            const name = groupName(group, t);
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
                    aria-label={t(expanded ? "stu.bycls.collapseClass" : "stu.bycls.expandClass", { name })}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary">
                      {expanded ? <Minus size={15} /> : <Plus size={15} />}
                    </span>
                    <h2 className="font-display text-lg font-semibold text-ink">{name}</h2>
                    {group.section && <Badge color="primary">{group.section}</Badge>}
                    {group.cycle && <Badge color="slate">{group.cycle}</Badge>}
                    <Badge color="green">{t("stu.bycls.studentCount", { count: group.rows.length })}</Badge>
                    <Badge color="blue">{t("stu.bycls.boysShort", { count: gBoys })}</Badge>
                    <Badge color="accent">{t("stu.bycls.girlsShort", { count: group.rows.length - gBoys })}</Badge>
                  </button>
                  <ExportButtons
                    fileName={t("stu.bycls.classFile", { name })}
                    title={t("stu.bycls.classTitle", { name })}
                    sections={[groupSection(group, t)]}
                    subtitle={[group.section, group.cycle].filter(Boolean).join(" - ")}
                  />
                </div>
                {expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted">
                        <th className="px-4 py-2 sm:px-5">{t("stu.bycls.colNo")}</th>
                        <th className="py-2 pr-4">{t("stu.bycls.colStudentNumber")}</th>
                        <th className="py-2 pr-4">{t("stu.bycls.thStudent")}</th>
                        <th className="py-2 pr-4">{t("stu.bycls.colSex")}</th>
                        <th className="py-2 pr-4">{t("stu.bycls.thBorn")}</th>
                        <th className="py-2 pr-4">{t("stu.bycls.colGuardian")}</th>
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
                            <Badge color={r.sexe === "M" ? "blue" : "accent"}>{r.sexe === "M" ? t("stu.bycls.sexShortM") : t("stu.bycls.sexShortF")}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-ink-muted">{formatDate(r.dateNaissance)}</td>
                          <td className="py-2 pr-4 text-ink-muted">
                            {r.responsable ? (
                              <>
                                {r.responsable}
                                {r.telephoneResponsable && <span className="block text-xs">{r.telephoneResponsable}</span>}
                              </>
                            ) : (
                              <span className="text-warning">{t("stu.bycls.toFill")}</span>
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
        {t("stu.bycls.exportNote")}
      </Card>
    </div>
  );
}
