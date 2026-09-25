"use client";

import { useEffect, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { useOnOutboxChange, useOutbox } from "@/lib/outbox";
import { formatDate, formatMontant } from "@/lib/format";
import { translate, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { CheckCircle2, Clock, Minus, Plus, Wallet, XCircle } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";

const CATEGORY_KEY: Record<ExpenseCategory, MessageKey> = {
  VERSEMENT_BANQUE: "fin.category.VERSEMENT_BANQUE",
  PAIEMENT_SALAIRE: "fin.category.PAIEMENT_SALAIRE",
  PAIEMENT_FACTURE: "fin.category.PAIEMENT_FACTURE",
  ACHAT_MATERIEL: "fin.category.ACHAT_MATERIEL",
  AUTRE: "fin.category.AUTRE",
};

const STATUS_META: Record<Expense["statut"], { labelKey: MessageKey; color: "orange" | "green" | "red"; icon: React.ReactNode; card: string }> = {
  EN_ATTENTE: { labelKey: "fin.status.EN_ATTENTE", color: "orange", icon: <Clock size={13} />, card: "border-l-warning bg-warning-soft/40" },
  APPROUVEE: { labelKey: "fin.status.APPROUVEE", color: "green", icon: <CheckCircle2 size={13} />, card: "border-l-success bg-success-soft/40" },
  REJETEE: { labelKey: "fin.status.REJETEE", color: "red", icon: <XCircle size={13} />, card: "border-l-danger bg-danger-soft/40 opacity-80" },
};

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("fin.needsOnline");
  return isApiError(err) ? err.message : translate("common.error");
}

export default function ExpensesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("EXPENSE_CREATE");
  const canApprove = hasPermission("EXPENSE_APPROVE");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ categorie: "ACHAT_MATERIEL" as ExpenseCategory, montant: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { entries } = useOutbox();

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function load() {
    const data = await api.get<Expense[]>("/expenses");
    setExpenses(data);
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch(() => setLoaded(true));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const montant = Number(form.montant);
      const res = await submitOrQueue({
        kind: "expense",
        method: "POST",
        path: "/expenses",
        body: { ...form, montant },
        label: t("fin.expenses.queueLabel", { category: t(CATEGORY_KEY[form.categorie]), description: form.description }),
        montant,
      });
      setForm({ categorie: "ACHAT_MATERIEL", montant: "", description: "" });
      if (res.queued) setNotice(t("fin.expenses.queued"));
      else setNotice(null);
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string) {
    try {
      await api.post(`/expenses/${id}/approve`);
      await load();
    } catch (err) {
      alert(describeError(err));
    }
  }

  async function handleReject(id: string) {
    const motif = prompt(t("fin.rejectPrompt"));
    if (!motif) return;
    try {
      await api.post(`/expenses/${id}/reject`, { motif });
      await load();
    } catch (err) {
      alert(describeError(err));
    }
  }

  useOnOutboxChange(() => void load().catch(() => {}));
  const pendingExpenses = entries.filter((e) => e.kind === "expense" && (e.status === "pending" || e.status === "failed"));

  const sum = (statut: Expense["statut"]) => expenses.filter((e) => e.statut === statut).reduce((n, e) => n + e.montant, 0);
  const count = (statut: Expense["statut"]) => expenses.filter((e) => e.statut === statut).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle
          eyebrow={t("fin.eyebrow", { n: 5 })}
          subtitle={t("fin.expenses.subtitle")}
          helpId="depenses"
        >
          {t("fin.expenses.title")}
        </PageTitle>
        <ExportButtons
          fileName={t("fin.expenses.exportFile")}
          title={t("fin.expenses.title")}
          landscape
          disabled={!loaded}
          sections={[
            buildSection(
              t("fin.expenses.sheet"),
              [
                { header: t("fin.f.date"), value: (e: Expense) => formatDate(e.dateDepense) },
                { header: t("fin.f.category"), value: (e: Expense) => t(CATEGORY_KEY[e.categorie]) },
                { header: t("fin.f.description"), value: (e: Expense) => e.description },
                { header: t("fin.f.amount"), value: (e: Expense) => e.montant, kind: "money" },
                { header: t("fin.f.status"), value: (e: Expense) => t(STATUS_META[e.statut].labelKey) },
                { header: t("fin.expenses.enteredBy"), value: (e: Expense) => `${e.effectuePar.prenom} ${e.effectuePar.nom}` },
                { header: t("fin.expenses.decidedBy"), value: (e: Expense) => (e.approbateur ? `${e.approbateur.prenom} ${e.approbateur.nom}` : "") },
                { header: t("fin.expenses.rejectionReason"), value: (e: Expense) => e.motifRejet ?? "" },
              ],
              expenses,
              [t("fin.expenses.totalApproved"), "", "", sum("APPROUVEE"), "", "", "", ""],
            ),
          ]}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("fin.expenses.statApproved")} value={formatMontant(sum("APPROUVEE"))} tone="danger" icon={<CheckCircle2 size={18} />} hint={t("fin.expenses.statApprovedHint", { n: count("APPROUVEE") })} />
        <StatCard label={t("fin.expenses.statPending")} value={formatMontant(sum("EN_ATTENTE"))} tone="warning" icon={<Clock size={18} />} hint={t("fin.f.expenseCount", { n: count("EN_ATTENTE") })} />
        <StatCard label={t("fin.expenses.statRejected")} value={formatMontant(sum("REJETEE"))} tone="info" icon={<XCircle size={18} />} hint={t("fin.expenses.statRejectedHint", { n: count("REJETEE") })} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Wallet size={18} className="text-primary" /> {t("fin.expenses.history")}
          </h2>
          {notice && <p className="mb-3 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{notice}</p>}
          {pendingExpenses.length > 0 && (
            <div className="mb-3 space-y-2">
              {pendingExpenses.map((e) => (
                <div
                  key={e.id}
                  className={`rounded-xl border border-l-4 border-border p-3 text-sm ${
                    e.status === "failed" ? "border-l-danger bg-danger-soft/40" : "border-l-warning bg-warning-soft/40"
                  }`}
                >
                  <p className="font-medium text-ink">
                    {e.label} · <span className="font-semibold text-danger">- {formatMontant(e.montant ?? 0)}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {e.status === "failed" ? t("fin.expenses.refusedOnSend", { error: e.error ?? "" }) : t("fin.awaitingSend")}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!loaded ? null : expenses.length === 0 ? (
            <EmptyState icon={<Wallet />} title={t("fin.expenses.empty")} />
          ) : (
            <div className="space-y-2">
              {expenses.length > 1 && (
                <div className="mb-1 flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setOpen(new Set(expenses.map((x) => x.id)))}
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
              {expenses.map((exp) => {
                const meta = STATUS_META[exp.statut];
                const expanded = open.has(exp.id);
                return (
                  <div key={exp.id} className={`rounded-xl border border-l-4 border-border p-3 ${meta.card}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggle(exp.id)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? t("common.collapse") : t("common.expand")} ${t(CATEGORY_KEY[exp.categorie])}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-surface-muted"
                        >
                          {expanded ? <Minus size={15} /> : <Plus size={15} />}
                        </button>
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {t(CATEGORY_KEY[exp.categorie])} · <span className="font-semibold text-danger">- {formatMontant(exp.montant)}</span>
                          </p>
                          <p className="text-xs text-ink-muted">{formatDate(exp.dateDepense)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={meta.color}>
                          <span className="flex items-center gap-1">
                            {meta.icon} {t(meta.labelKey)}
                          </span>
                        </Badge>
                        {canApprove && exp.statut === "EN_ATTENTE" && (
                          <>
                            <button
                              onClick={() => void handleApprove(exp.id)}
                              className="text-xs font-medium text-success hover:underline"
                            >
                              {t("fin.approve")}
                            </button>
                            <button
                              onClick={() => void handleReject(exp.id)}
                              className="text-xs font-medium text-danger hover:underline"
                            >
                              {t("fin.reject")}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-ink-muted">{t("fin.f.description")}</dt>
                          <dd className="font-medium text-ink">{exp.description}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("fin.expenses.enteredBy")}</dt>
                          <dd className="font-medium text-ink">
                            {exp.effectuePar.prenom} {exp.effectuePar.nom}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">{t("fin.expenses.decision")}</dt>
                          <dd className="font-medium text-ink">
                            {exp.approbateur
                              ? exp.dateDecision
                                ? t("fin.expenses.decidedOn", {
                                    name: `${exp.approbateur.prenom} ${exp.approbateur.nom}`,
                                    date: formatDate(exp.dateDecision),
                                  })
                                : `${exp.approbateur.prenom} ${exp.approbateur.nom}`
                              : t("fin.expenses.awaitingManagement")}
                          </dd>
                        </div>
                        {exp.motifRejet && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-danger">{t("fin.expenses.rejectionReason")}</dt>
                            <dd className="font-medium text-danger">{exp.motifRejet}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {canCreate && (
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">{t("fin.expenses.record")}</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label={t("fin.f.category")}>
                <Select
                  value={form.categorie}
                  onChange={(e) => setForm({ ...form, categorie: e.target.value as ExpenseCategory })}
                >
                  {(Object.keys(CATEGORY_KEY) as ExpenseCategory[]).map((value) => (
                    <option key={value} value={value}>
                      {t(CATEGORY_KEY[value])}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("fin.f.amount")}>
                <Input
                  type="number"
                  required
                  min={1}
                  value={form.montant}
                  onChange={(e) => setForm({ ...form, montant: e.target.value })}
                />
              </Field>
              <Field label={t("fin.f.description")}>
                <Input
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t("fin.expenses.detailPlaceholder")}
                />
              </Field>
              <ErrorMessage>{error}</ErrorMessage>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? t("fin.saving") : t("fin.expenses.save")}
              </Button>
              <p className="text-xs text-ink-muted">
                {t("fin.expenses.needsApproval")}
              </p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
