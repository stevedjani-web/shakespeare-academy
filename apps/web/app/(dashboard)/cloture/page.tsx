"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import { buildSection, type ExportSection } from "@/lib/export";
import { type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { CashClosing, CashClosingEntry, CashClosingExpense, ExpenseCategory } from "@/lib/types";
import { categoryLabel as labelOfCategory } from "@/lib/expense-categories";
import { Badge, Card, EmptyState, Input, PageTitle, StatCard } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, Wallet } from "lucide-react";

const MODE_KEY: Record<string, MessageKey> = {
  ESPECES: "fin.mode.ESPECES",
  MOBILE_MONEY: "fin.mode.MOBILE_MONEY",
  VIREMENT: "fin.expenses.mode.VIREMENT",
  CHEQUE: "fin.expenses.mode.CHEQUE",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashClosingPage() {
  const { t } = useI18n();
  const [date, setDate] = useState(todayIso());
  const [closing, setClosing] = useState<CashClosing | null>(null);
  const [loaded, setLoaded] = useState(false);
  const expandIn = useExpanded();
  const expandOut = useExpanded();

  const categoryLabel = (c: ExpenseCategory) => labelOfCategory(t, c);
  const modeLabel = (m: string) => (MODE_KEY[m] ? t(MODE_KEY[m]) : m);

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
        t("fin.closing.summary"),
        [
          { header: t("common.indicator"), value: (r: [string, number]) => r[0] },
          { header: t("fin.f.amount"), value: (r: [string, number]) => r[1], kind: "money" },
        ],
        [
          [t("fin.closing.incomeOfDay"), closing.entrees.total],
          [t("fin.closing.expensesOfDay"), closing.sorties.total],
          [t("fin.closing.balanceOfDay"), closing.soldeJour],
          [t("fin.closing.cumulative"), closing.soldeCumule],
        ],
      ),
      buildSection(
        t("fin.closing.incomeSheet"),
        [
          { header: t("fin.closing.receipt"), value: (e: CashClosingEntry) => e.numeroRecu },
          { header: t("fin.student"), value: (e: CashClosingEntry) => e.eleve ?? "" },
          { header: t("fin.f.reason"), value: (e: CashClosingEntry) => e.libelle },
          { header: t("fin.closing.method"), value: (e: CashClosingEntry) => modeLabel(e.modePaiement) },
          { header: t("fin.f.receivedBy"), value: (e: CashClosingEntry) => e.recuPar },
          { header: t("fin.f.amount"), value: (e: CashClosingEntry) => e.montant, kind: "money" },
        ],
        closing.entrees.items,
        [t("fin.closing.totalIncome"), "", "", "", "", closing.entrees.total],
      ),
      buildSection(
        t("fin.closing.expenseSheet"),
        [
          { header: t("fin.f.category"), value: (e: CashClosingExpense) => categoryLabel(e.categorie) },
          { header: t("fin.f.description"), value: (e: CashClosingExpense) => e.description },
          { header: t("fin.expenses.beneficiaryLabel"), value: (e: CashClosingExpense) => e.beneficiaire ?? "" },
          { header: t("fin.f.madeBy"), value: (e: CashClosingExpense) => e.effectuePar },
          { header: t("fin.expenses.mode"), value: (e: CashClosingExpense) => (e.modeDecaissement ? modeLabel(e.modeDecaissement) : "") },
          { header: t("fin.f.amount"), value: (e: CashClosingExpense) => e.montant, kind: "money" },
        ],
        closing.sorties.items,
        [t("fin.closing.totalExpenses"), "", "", "", "", closing.sorties.total],
      ),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, t]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle
          eyebrow={t("fin.eyebrow.cash")}
          subtitle={t("fin.closing.subtitle")}
          helpId="cloture"
        >
          {t("fin.closing.title")}
        </PageTitle>
        {closing && (
          <ExportButtons
            fileName={`${t("fin.closing.exportFile")}-${date}`}
            title={t("fin.closing.exportTitle", { date: formatDate(date) })}
            subtitle={t("fin.closing.exportSubtitle", { date: formatDate(date) })}
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
              label={t("fin.closing.incomeOfDay")}
              value={formatMontant(closing.entrees.total)}
              hint={t("fin.closing.paymentCount", { n: closing.entrees.count })}
              tone="success"
              icon={<ArrowDownCircle size={18} />}
            />
            <StatCard
              label={t("fin.closing.expensesOfDay")}
              value={formatMontant(closing.sorties.total)}
              hint={t("fin.closing.approvedCount", { n: closing.sorties.count })}
              tone={closing.sorties.total > 0 ? "danger" : "info"}
              icon={<ArrowUpCircle size={18} />}
            />
            <StatCard
              label={t("fin.closing.balanceOfDay")}
              value={formatMontant(closing.soldeJour)}
              tone={closing.soldeJour > 0 ? "success" : closing.soldeJour < 0 ? "danger" : "info"}
              icon={<Wallet size={18} />}
              hint={closing.soldeJour > 0 ? t("fin.closing.surplus") : closing.soldeJour < 0 ? t("fin.closing.deficit") : t("fin.closing.balanced")}
            />
            <StatCard
              label={t("fin.closing.cumulative")}
              value={formatMontant(closing.soldeCumule)}
              hint={t("fin.closing.sinceStart")}
              tone={closing.soldeCumule >= 0 ? "success" : "danger"}
              icon={<ClipboardList size={18} />}
            />
          </div>

          {(closing.entrees.parMode.ESPECES > 0 || closing.entrees.parMode.MOBILE_MONEY > 0 || closing.versements.jour.count > 0 || closing.versements.aVerifier.count > 0 || closing.aDecaisser.count > 0 || closing.entrees.reprise.count > 0 || closing.entrees.fraisService.count > 0 || closing.especes.enCaisse !== 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(closing.entrees.parMode.ESPECES > 0 || closing.entrees.parMode.MOBILE_MONEY > 0) && (
                <>
                  <Badge color="green">{t("fin.closing.modeAmount", { mode: t("fin.mode.ESPECES"), amount: formatMontant(closing.entrees.parMode.ESPECES) })}</Badge>
                  <Badge color="blue">{t("fin.closing.modeAmount", { mode: t("fin.mode.MOBILE_MONEY"), amount: formatMontant(closing.entrees.parMode.MOBILE_MONEY) })}</Badge>
                </>
              )}
              {closing.entrees.fraisService.count > 0 && (
                <Badge color="orange">{t("fin.closing.serviceFees", { amount: formatMontant(closing.entrees.fraisService.total), n: closing.entrees.fraisService.count })}</Badge>
              )}
              {closing.entrees.reprise.count > 0 && (
                <Badge color="primary">{t("fin.closing.reprise", { amount: formatMontant(closing.entrees.reprise.total), n: closing.entrees.reprise.count })}</Badge>
              )}
              {closing.versements.jour.count > 0 && (
                <Badge color="slate">{t("fin.closing.bankDeposits", { amount: formatMontant(closing.versements.jour.total), n: closing.versements.jour.count })}</Badge>
              )}
              {closing.versements.aVerifier.count > 0 && (
                <Badge color="orange">{t("fin.closing.depositsPending", { amount: formatMontant(closing.versements.aVerifier.total), n: closing.versements.aVerifier.count })}</Badge>
              )}
              <Badge color="blue">{t("fin.closing.cashOnHand", { amount: formatMontant(closing.especes.enCaisse) })}</Badge>
              {closing.aDecaisser.count > 0 && (
                <Badge color="orange">{t("fin.closing.toDisburse", { amount: formatMontant(closing.aDecaisser.total), n: closing.aDecaisser.count })}</Badge>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-success">{t("fin.closing.incomeTitle", { date: formatDate(date) })}</h2>
              {closing.entrees.items.length === 0 ? (
                <EmptyState icon={<ArrowDownCircle />} title={t("fin.closing.noIncome")} />
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
                                <dt className="text-xs text-ink-muted">{t("fin.f.reason")}</dt>
                                <dd className="font-medium text-ink">{item.libelle}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">{t("fin.student")}</dt>
                                <dd className="font-medium text-ink">{item.eleve ?? "-"}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">{t("fin.f.method")}</dt>
                                <dd className="font-medium text-ink">{modeLabel(item.modePaiement)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-ink-muted">{t("fin.f.receivedBy")}</dt>
                                <dd className="font-medium text-ink">{item.recuPar}</dd>
                              </div>
                              {item.fraisService > 0 && (
                                <div>
                                  <dt className="text-xs text-ink-muted">{t("receipt.serviceFee")}</dt>
                                  <dd className="font-medium text-ink">{formatMontant(item.fraisService)}</dd>
                                </div>
                              )}
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
              <h2 className="mb-3 font-display text-lg font-semibold text-danger">{t("fin.closing.expensesTitle", { date: formatDate(date) })}</h2>
              {closing.sorties.items.length === 0 ? (
                <EmptyState icon={<ArrowUpCircle />} title={t("fin.closing.noExpenses")} />
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
                      const label = categoryLabel(item.categorie);
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
                                <dt className="text-xs text-ink-muted">{t("fin.f.description")}</dt>
                                <dd className="font-medium text-ink">{item.description}</dd>
                              </div>
                              {item.beneficiaire && (
                                <div>
                                  <dt className="text-xs text-ink-muted">{t("fin.expenses.beneficiaryLabel")}</dt>
                                  <dd className="font-medium text-ink">{item.beneficiaire}</dd>
                                </div>
                              )}
                              <div>
                                <dt className="text-xs text-ink-muted">{t("fin.f.madeBy")}</dt>
                                <dd className="font-medium text-ink">{item.effectuePar}</dd>
                              </div>
                              {item.decaissePar && (
                                <div>
                                  <dt className="text-xs text-ink-muted">{t("fin.expenses.disbursement")}</dt>
                                  <dd className="font-medium text-ink">
                                    {item.decaissePar}
                                    {item.modeDecaissement && ` · ${modeLabel(item.modeDecaissement)}`}
                                  </dd>
                                </div>
                              )}
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
