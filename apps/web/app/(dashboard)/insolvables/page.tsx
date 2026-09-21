"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow="Lot 5" subtitle="Élèves dont au moins une échéance est en retard, non couverte par un paiement.">
          Élèves insolvables
        </PageTitle>
        {loaded && students.length > 0 && (
          <ExportButtons
            fileName="eleves-insolvables"
            title="Élèves insolvables"
            landscape
            sections={[
              buildSection(
                "Élèves insolvables",
                [
                  { header: "Matricule", value: (r: InsolventStudent) => r.student.matricule },
                  { header: "Nom", value: (r: InsolventStudent) => r.student.nom },
                  { header: "Prénom", value: (r: InsolventStudent) => r.student.prenom },
                  { header: "Classe", value: (r: InsolventStudent) => r.classe ?? "" },
                  { header: "Responsable", value: (r: InsolventStudent) => r.guardian?.nom ?? "" },
                  { header: "Téléphone", value: (r: InsolventStudent) => r.guardian?.telephone ?? "" },
                  { header: "Statut", value: (r: InsolventStudent) => (r.statut === "IMPAYE_CRITIQUE" ? "Impayé critique" : "En retard") },
                  { header: "Montant exigible", value: (r: InsolventStudent) => r.montantExigible, kind: "money" },
                  { header: "Montant restant", value: (r: InsolventStudent) => r.montantRestant, kind: "money" },
                  { header: "Prochaine échéance", value: (r: InsolventStudent) => (r.prochaineEcheance ? `${r.prochaineEcheance.libelle} (${formatDate(r.prochaineEcheance.dateLimite)})` : "") },
                ],
                students,
                ["Total", "", "", "", "", "", "", totalExigible, totalRestant, ""],
              ),
            ]}
          />
        )}
      </div>

      {loaded && students.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatCard label="Élèves en retard" value={students.length} tone="danger" icon={<AlertOctagon size={18} />} />
          <StatCard label="Montant exigible" value={formatMontant(totalExigible)} tone="danger" icon={<Wallet size={18} />} hint="Déjà échu, à relancer" />
          <StatCard label="Restant dû total" value={formatMontant(totalRestant)} tone="warning" icon={<Wallet size={18} />} hint="Y compris les échéances à venir" />
        </div>
      )}

      {loaded && students.length > 1 && (
        <div className="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOpen(new Set(students.map((r) => r.student.id)))}
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

      {!loaded ? null : students.length === 0 ? (
        <EmptyState icon={<AlertOctagon />} title="Aucun élève insolvable." description="Tous les frais exigibles sont couverts." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="w-10 py-2 pr-2" aria-label="Détails"></th>
                  <th className="py-2 pr-4">Élève</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Montant exigible</th>
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
                            aria-label={`${expanded ? "Réduire" : "Développer"} ${name}`}
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
                              {row.statut === "IMPAYE_CRITIQUE" ? "Impayé critique" : "En retard"}
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
                              <Detail label="Classe" value={row.classe ?? "-"} />
                              <Detail label="Responsable" value={row.guardian?.nom ?? "-"} />
                              <p>
                                <span className="block text-xs text-ink-muted">Téléphone</span>
                                {row.guardian ? (
                                  <a href={`tel:${row.guardian.telephone}`} className="font-medium text-primary hover:underline">
                                    {row.guardian.telephone}
                                  </a>
                                ) : (
                                  <span className="font-medium text-ink">-</span>
                                )}
                              </p>
                              <Detail label="Montant exigible" value={formatMontant(row.montantExigible)} />
                              <Detail label="Restant dû total" value={formatMontant(row.montantRestant)} />
                              <Detail
                                label="Prochaine échéance"
                                value={
                                  row.prochaineEcheance
                                    ? `${row.prochaineEcheance.libelle} (${formatDate(row.prochaineEcheance.dateLimite)})`
                                    : "-"
                                }
                              />
                              <div className="flex items-end">
                                <Link href={`/eleves/${id}`} className="font-medium text-primary hover:underline">
                                  Ouvrir le dossier
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
