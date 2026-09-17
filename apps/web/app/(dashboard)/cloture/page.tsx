"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import type { CashClosing } from "@/lib/types";
import { Card, EmptyState, Input, PageTitle, StatCard } from "@/components/ui";
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, Wallet } from "lucide-react";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashClosingPage() {
  const [date, setDate] = useState(todayIso());
  const [closing, setClosing] = useState<CashClosing | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    void api.get<CashClosing>(`/reports/cash-closing?date=${date}`).then((data) => {
      setClosing(data);
      setLoaded(true);
    });
  }, [date]);

  return (
    <div>
      <PageTitle eyebrow="Lot 5" subtitle="État des entrées, sorties et solde de caisse pour une journée donnée.">
        Clôture de journée
      </PageTitle>

      <div className="mb-6 max-w-xs">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {!loaded || !closing ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Entrées du jour"
              value={formatMontant(closing.entrees.total)}
              hint={`${closing.entrees.count} paiement(s)`}
              tone="success"
              icon={<ArrowDownCircle size={18} />}
            />
            <StatCard
              label="Sorties du jour"
              value={formatMontant(closing.sorties.total)}
              hint={`${closing.sorties.count} sortie(s) approuvée(s)`}
              tone="danger"
              icon={<ArrowUpCircle size={18} />}
            />
            <StatCard
              label="Solde du jour"
              value={formatMontant(closing.soldeJour)}
              tone="primary"
              icon={<Wallet size={18} />}
            />
            <StatCard
              label="Solde cumulé en caisse"
              value={formatMontant(closing.soldeCumule)}
              hint="Depuis le début"
              tone="accent"
              icon={<ClipboardList size={18} />}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Entrées ({formatDate(date)})</h2>
              {closing.entrees.items.length === 0 ? (
                <EmptyState icon={<ArrowDownCircle />} title="Aucune entrée ce jour." />
              ) : (
                <ul className="space-y-2">
                  {closing.entrees.items.map((item) => (
                    <li key={item.id} className="rounded-xl border border-border p-3 text-sm">
                      <p className="font-medium text-ink">
                        {item.numeroRecu} — {formatMontant(item.montant)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {item.libelle} {item.eleve && <>· {item.eleve}</>} · {item.recuPar}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Sorties ({formatDate(date)})</h2>
              {closing.sorties.items.length === 0 ? (
                <EmptyState icon={<ArrowUpCircle />} title="Aucune sortie approuvée ce jour." />
              ) : (
                <ul className="space-y-2">
                  {closing.sorties.items.map((item) => (
                    <li key={item.id} className="rounded-xl border border-border p-3 text-sm">
                      <p className="font-medium text-ink">
                        {item.categorie} — {formatMontant(item.montant)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {item.description} · {item.effectuePar}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
