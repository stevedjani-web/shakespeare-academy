"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { InsolventStudent } from "@/lib/types";
import { Badge, Card, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { AlertOctagon, AlertTriangle, Minus, Plus, Wallet } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </p>
  );
}

export default function InsolventStudentsPage() {
  const { t } = useI18n();
  const [students, setStudents] = useState<InsolventStudent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    void api.get<InsolventStudent[]>("/reports/insolvent-students").then((data) => {
      setStudents(data);
      setLoaded(true);
    });
  }, []);

  const totalExigible = students.reduce((n, r) => n + r.montantExigible, 0);
  const totalRestant = students.reduce((n, r) => n + r.montantRestant, 0);
  const statusLabel = (statut: InsolventStudent["statut"]) =>
    statut === "IMPAYE_CRITIQUE" ? t("fin.solvency.IMPAYE_CRITIQUE") : t("fin.solvency.EN_RETARD");

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageTitle
          eyebrow={t("fin.eyebrow", { n: 5 })}
          subtitle={t("fin.overdue.subtitle")}
          helpId="insolvables"
        >
          {t("fin.overdue.title")}
        </PageTitle>
        {loaded && students.length > 0 && (
          <ExportButtons
            fileName={t("fin.overdue.exportFile")}
            title={t("fin.overdue.title")}
            landscape
            sections={[
              buildSection(
                t("fin.overdue.title"),
                [
                  { header: t("fin.f.studentId"), value: (r: InsolventStudent) => r.student.matricule },
                  { header: t("fin.f.lastName"), value: (r: InsolventStudent) => r.student.nom },
                  { header: t("fin.f.firstName"), value: (r: InsolventStudent) => r.student.prenom },
                  { header: t("common.class"), value: (r: InsolventStudent) => r.classe ?? "" },
                  { header: t("fin.f.guardian"), value: (r: InsolventStudent) => r.guardian?.nom ?? "" },
                  { header: t("fin.f.phone"), value: (r: InsolventStudent) => r.guardian?.telephone ?? "" },
                  { header: t("fin.f.status"), value: (r: InsolventStudent) => statusLabel(r.statut) },
                  { header: t("fin.f.amountDue"), value: (r: InsolventStudent) => r.montantExigible, kind: "money" },
                  { header: t("fin.overdue.remainingAmount"), value: (r: InsolventStudent) => r.montantRestant, kind: "money" },
                  { header: t("fin.f.nextDue"), value: (r: InsolventStudent) => (r.prochaineEcheance ? `${r.prochaineEcheance.libelle} (${formatDate(r.prochaineEcheance.dateLimite)})` : "") },
                ],
                students,
                [t("common.total"), "", "", "", "", "", "", totalExigible, totalRestant, ""],
              ),
            ]}
          />
        )}
      </div>

      {loaded && students.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatCard label={t("fin.overdue.statStudents")} value={students.length} tone="danger" icon={<AlertOctagon size={18} />} />
          <StatCard label={t("fin.f.amountDue")} value={formatMontant(totalExigible)} tone="danger" icon={<Wallet size={18} />} hint={t("fin.overdue.dueHint")} />
          <StatCard label={t("fin.overdue.totalRemaining")} value={formatMontant(totalRestant)} tone="warning" icon={<Wallet size={18} />} hint={t("fin.overdue.totalRemainingHint")} />
        </div>
      )}

      {loaded && students.length > 1 && (
        <div className="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOpen(new Set(students.map((r) => r.student.id)))}
            className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
          >
            {t("common.expandAll")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(new Set())}
            className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
          >
            {t("common.collapseAll")}
          </button>
        </div>
      )}

      {!loaded ? null : students.length === 0 ? (
        <EmptyState icon={<AlertOctagon />} title={t("fin.overdue.empty")} description={t("fin.overdue.emptyText")} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="w-10 py-2 pr-2" aria-label={t("fin.overdue.details")}></th>
                  <th className="py-2 pr-4">{t("fin.student")}</th>
                  <th className="py-2 pr-4">{t("fin.f.status")}</th>
                  <th className="py-2 pr-4">{t("fin.f.amountDue")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => {
                  const id = row.student.id;
                  const expanded = open.has(id);
                  const name = `${row.student.prenom} ${row.student.nom}`;
                  return (
                    <Fragment key={id}>
                      <tr className={`border-b border-border last:border-0 hover:bg-surface-muted ${row.statut === "IMPAYE_CRITIQUE" ? "bg-danger-soft/40" : ""}`}>
                        <td className="py-2.5 pr-2">
                          <button
                            type="button"
                            onClick={() => toggle(id)}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? t("common.collapse") : t("common.expand")} ${name}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-surface-muted"
                          >
                            {expanded ? <Minus size={15} /> : <Plus size={15} />}
                          </button>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Link href={`/eleves/${id}`} className="font-medium text-ink hover:underline">
                            {name}
                          </Link>
                          <p className="text-xs text-ink-muted">{row.student.matricule}</p>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge color={row.statut === "IMPAYE_CRITIQUE" ? "red" : "orange"}>
                            <span className="flex items-center gap-1">
                              <AlertTriangle size={12} />
                              {statusLabel(row.statut)}
                            </span>
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-danger">{formatMontant(row.montantExigible)}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border bg-surface-muted/50">
                          <td></td>
                          <td colSpan={3} className="py-3 pr-4">
                            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                              <Detail label={t("common.class")} value={row.classe ?? "-"} />
                              <Detail label={t("fin.f.guardian")} value={row.guardian?.nom ?? "-"} />
                              <p>
                                <span className="block text-xs text-ink-muted">{t("fin.f.phone")}</span>
                                {row.guardian ? (
                                  <a href={`tel:${row.guardian.telephone}`} className="font-medium text-primary hover:underline">
                                    {row.guardian.telephone}
                                  </a>
                                ) : (
                                  <span className="font-medium text-ink">-</span>
                                )}
                              </p>
                              <Detail label={t("fin.f.amountDue")} value={formatMontant(row.montantExigible)} />
                              <Detail label={t("fin.overdue.totalRemaining")} value={formatMontant(row.montantRestant)} />
                              <Detail
                                label={t("fin.f.nextDue")}
                                value={
                                  row.prochaineEcheance
                                    ? `${row.prochaineEcheance.libelle} (${formatDate(row.prochaineEcheance.dateLimite)})`
                                    : "-"
                                }
                              />
                              <div className="flex items-end">
                                <Link href={`/eleves/${id}`} className="font-medium text-primary hover:underline">
                                  {t("fin.f.openFile")}
                                </Link>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
