"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import { buildSection, type ExportSection } from "@/lib/export";
import type { CashClosing, CashClosingEntry, CashClosingExpense, ExpenseCategory } from "@/lib/types";
import { Badge, Card, EmptyState, Input, PageTitle, StatCard } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, Wallet } from "lucide-react";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  VERSEMENT_BANQUE: "Versement banque",
  PAIEMENT_SALAIRE: "Paiement salaire",
  PAIEMENT_FACTURE: "Paiement facture",
  ACHAT_MATERIEL: "Achat matériel",
  AUTRE: "Autre",
};

const MODE_LABEL: Record<string, string> = { ESPECES: "Espèces", MOBILE_MONEY: "Mobile Money" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashClosingPage() {
  const [date, setDate] = useState(todayIso());
  const [closing, setClosing] = useState<CashClosing | null>(null);
  const [loaded, setLoaded] = useState(false);
  const expandIn = useExpanded();
  const expandOut = useExpanded();

  useEffect(() => {
    setLoaded(false);
    void api.get<CashClosing>(`/reports/cash-closing?date=${date}`).then((data) => {
      setClosing(data);
      setLoaded(true);
    });
  }, [date]);

  const sections = useMemo<ExportSection[]>(() => {
    if (!closing) return [];
    return [
      buildSection(
        "Récapitulatif",
        [
          { header: "Indicateur", value: (r: [string, number]) => r[0] },
          { header: "Montant", value: (r: [string, number]) => r[1], kind: "money" },
        ],
        [
          ["Entrées du jour", closing.entrees.total],
          ["Sorties du jour", closing.sorties.total],
          ["Solde du jour", closing.soldeJour],
          ["Solde cumulé en caisse", closing.soldeCumule],
        ],
      ),
      buildSection(
        "Entrées",
        [
          { header: "Reçu", value: (e: CashClosingEntry) => e.numeroRecu },
          { header: "Élève", value: (e: CashClosingEntry) => e.eleve ?? "" },
          { header: "Motif", value: (e: CashClosingEntry) => e.libelle },
          { header: "Mode", value: (e: CashClosingEntry) => MODE_LABEL[e.modePaiement] ?? e.modePaiement },
          { header: "Reçu par", value: (e: CashClosingEntry) => e.recuPar },
          { header: "Montant", value: (e: CashClosingEntry) => e.montant, kind: "money" },
        ],
        closing.entrees.items,
        ["Total entrées", "", "", "", "", closing.entrees.total],
      ),
      buildSection(
        "Sorties",
        [
          { header: "Catégorie", value: (e: CashClosingExpense) => CATEGORY_LABEL[e.categorie] ?? e.categorie },
          { header: "Description", value: (e: CashClosingExpense) => e.description },
          { header: "Effectuée par", value: (e: CashClosingExpense) => e.effectuePar },
          { header: "Montant", value: (e: CashClosingExpense) => e.montant, kind: "money" },
        ],
        closing.sorties.items,
        ["Total sorties", "", "", closing.sorties.total],
      ),
    ];
  }, [closing]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow="Lot 5" subtitle="État des entrées, sorties et solde de caisse pour une journée donnée.">
          Clôture de journée
        </PageTitle>
        {closing && (
          <ExportButtons
            fileName={`cloture-${date}`}
            title={`Clôture de journée du ${formatDate(date)}`}
            subtitle={`Journée du ${formatDate(date)}`}
            sections={sections}
          />
        )}
      </div>

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
              tone={closing.sorties.total > 0 ? "danger" : "info"}
              icon={<ArrowUpCircle size={18} />}
            />
            <StatCard
              label="Solde du jour"
              value={formatMontant(closing.soldeJour)}
              tone={closing.soldeJour > 0 ? "success" : closing.soldeJour < 0 ? "danger" : "info"}
              icon={<Wallet size={18} />}
              hint={closing.soldeJour > 0 ? "Excédent" : closing.soldeJour < 0 ? "Déficit" : "Équilibré"}
            />
            <StatCard
              label="Solde cumulé en caisse"
              value={formatMontant(closing.soldeCumule)}
              hint="Depuis le début"
              tone={closing.soldeCumule >= 0 ? "success" : "danger"}
              icon={<ClipboardList size={18} />}
            />
          </div>

          {(closing.entrees.parMode.ESPECES > 0 || closing.entrees.parMode.MOBILE_MONEY > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge color="green">Espèces : {formatMontant(closing.entrees.parMode.ESPECES)}</Badge>
              <Badge color="blue">Mobile Money : {formatMontant(closing.entrees.parMode.MOBILE_MONEY)}</Badge>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-success">Entrées ({formatDate(date)})</h2>
              {closing.entrees.items.length === 0 ? (
                <EmptyState icon={<ArrowDownCircle />} title="Aucune entrée ce jour." />
              ) : (
                <>
                  <ExpandAll
                    count={closing.entrees.items.length}
                    onOpenAll={() => expandIn.openAll(closing.entrees.items.map((i) => i.id))}
                    onCloseAll={expandIn.closeAll}
                  />
                  <ul className="space-y-2">
                    {closing.entrees.items.map((item) => {
                      const expanded = expandIn.isOpen(item.id);
                      return (
                        <li key={item.id} className="rounded-xl border border-l-4 border-border border-l-success bg-success-soft/40 p-3 text-sm">
                          <div className="flex items-center gap-2.5">
                            <ExpandButton open={expanded} onClick={() => expandIn.toggle(item.id)} label={item.numeroRecu} />
                            <p className="flex flex-1 flex-wrap items-center justify-between gap-2 font-medium text-ink">
                              <span>{item.numeroRecu}</span>
                              <span className="font-semibold text-success">+ {formatMontant(item.montant)}</span>
                            </p>
                          </div>
                          {expanded && (
                            <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-ink-muted">Motif</dt>
                                <dd className="font-medium text-ink">{item.libelle}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">Élève</dt>
                                <dd className="font-medium text-ink">{item.eleve ?? "-"}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">Mode de paiement</dt>
                                <dd className="font-medium text-ink">{MODE_LABEL[item.modePaiement] ?? item.modePaiement}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">Reçu par</dt>
                                <dd className="font-medium text-ink">{item.recuPar}</dd>
                              </div>
                            </dl>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-danger">Sorties ({formatDate(date)})</h2>
              {closing.sorties.items.length === 0 ? (
                <EmptyState icon={<ArrowUpCircle />} title="Aucune sortie approuvée ce jour." />
              ) : (
                <>
                  <ExpandAll
                    count={closing.sorties.items.length}
                    onOpenAll={() => expandOut.openAll(closing.sorties.items.map((i) => i.id))}
                    onCloseAll={expandOut.closeAll}
                  />
                  <ul className="space-y-2">
                    {closing.sorties.items.map((item) => {
                      const expanded = expandOut.isOpen(item.id);
                      const label = CATEGORY_LABEL[item.categorie] ?? item.categorie;
                      return (
                        <li key={item.id} className="rounded-xl border border-l-4 border-border border-l-danger bg-danger-soft/40 p-3 text-sm">
                          <div className="flex items-center gap-2.5">
                            <ExpandButton open={expanded} onClick={() => expandOut.toggle(item.id)} label={label} />
                            <p className="flex flex-1 flex-wrap items-center justify-between gap-2 font-medium text-ink">
                              <span>{label}</span>
                              <span className="font-semibold text-danger">- {formatMontant(item.montant)}</span>
                            </p>
                          </div>
                          {expanded && (
                            <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-ink-muted">Description</dt>
                                <dd className="font-medium text-ink">{item.description}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">Effectuée par</dt>
                                <dd className="font-medium text-ink">{item.effectuePar}</dd>
                              </div>
                            </dl>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
