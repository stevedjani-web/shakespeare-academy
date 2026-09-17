"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import type { InsolventStudent } from "@/lib/types";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { AlertOctagon, AlertTriangle } from "lucide-react";

export default function InsolventStudentsPage() {
  const [students, setStudents] = useState<InsolventStudent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api.get<InsolventStudent[]>("/reports/insolvent-students").then((data) => {
      setStudents(data);
      setLoaded(true);
    });
  }, []);

  return (
    <div>
      <PageTitle eyebrow="Lot 5" subtitle="Élèves dont au moins une échéance est en retard, non couverte par un paiement.">
        Élèves insolvables
      </PageTitle>

      {!loaded ? null : students.length === 0 ? (
        <EmptyState icon={<AlertOctagon />} title="Aucun élève insolvable." description="Tous les frais exigibles sont couverts." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="py-2 pr-4">Élève</th>
                  <th className="py-2 pr-4">Classe</th>
                  <th className="py-2 pr-4">Responsable</th>
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Montant exigible</th>
                  <th className="py-2 pr-4">Prochaine échéance</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => (
                  <tr key={row.student.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                    <td className="py-2.5 pr-4">
                      <Link href={`/eleves/${row.student.id}`} className="font-medium text-ink hover:underline">
                        {row.student.prenom} {row.student.nom}
                      </Link>
                      <p className="text-xs text-ink-muted">{row.student.matricule}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-ink-muted">{row.classe ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-ink-muted">
                      {row.guardian ? (
                        <>
                          {row.guardian.nom}
                          <br />
                          <a href={`tel:${row.guardian.telephone}`} className="hover:underline">
                            {row.guardian.telephone}
                          </a>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge color={row.statut === "IMPAYE_CRITIQUE" ? "red" : "orange"}>
                        <span className="flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {row.statut === "IMPAYE_CRITIQUE" ? "Impayé critique" : "En retard"}
                        </span>
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-ink">{formatMontant(row.montantExigible)}</td>
                    <td className="py-2.5 pr-4 text-ink-muted">
                      {row.prochaineEcheance
                        ? `${row.prochaineEcheance.libelle} (${formatDate(row.prochaineEcheance.dateLimite)})`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
