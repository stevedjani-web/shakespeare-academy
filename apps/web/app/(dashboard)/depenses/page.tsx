"use client";

import { useEffect, useState } from "react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { useOnOutboxChange, useOutbox } from "@/lib/outbox";
import { formatDate, formatMontant } from "@/lib/format";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { CheckCircle2, Clock, Minus, Plus, Wallet, XCircle } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  VERSEMENT_BANQUE: "Versement banque",
  PAIEMENT_SALAIRE: "Paiement salaire",
  PAIEMENT_FACTURE: "Paiement facture",
  ACHAT_MATERIEL: "Achat matériel",
  AUTRE: "Autre",
};

const STATUS_META: Record<Expense["statut"], { label: string; color: "orange" | "green" | "red"; icon: React.ReactNode; card: string }> = {
  EN_ATTENTE: { label: "En attente", color: "orange", icon: <Clock size={13} />, card: "border-l-warning bg-warning-soft/40" },
  APPROUVEE: { label: "Approuvée", color: "green", icon: <CheckCircle2 size={13} />, card: "border-l-success bg-success-soft/40" },
  REJETEE: { label: "Rejetée", color: "red", icon: <XCircle size={13} />, card: "border-l-danger bg-danger-soft/40 opacity-80" },
};

function describeError(err: unknown): string {
  if (isOfflineError(err)) return "Cette action nécessite une connexion Internet. Réessayez quand elle sera revenue.";
  return isApiError(err) ? err.message : "Une erreur est survenue.";
}

export default function ExpensesPage() {
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
        label: `${CATEGORY_LABEL[form.categorie]} : ${form.description}`,
        montant,
      });
      setForm({ categorie: "ACHAT_MATERIEL", montant: "", description: "" });
      if (res.queued) setNotice("Sortie enregistrée sur cet appareil : elle sera envoyée à la Direction au retour d'Internet.");
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
    const motif = prompt("Motif du rejet :");
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
          eyebrow="Lot 5"
          subtitle="Versements, salaires, factures, achats de matériel et autres sorties."
          helpId="depenses"
        >
          Sorties financières
        </PageTitle>
        <ExportButtons
          fileName="sorties-financieres"
          title="Sorties financières"
          landscape
          disabled={!loaded}
          sections={[
            buildSection(
              "Sorties",
              [
                { header: "Date", value: (e: Expense) => formatDate(e.dateDepense) },
                { header: "Catégorie", value: (e: Expense) => CATEGORY_LABEL[e.categorie] },
                { header: "Description", value: (e: Expense) => e.description },
                { header: "Montant", value: (e: Expense) => e.montant, kind: "money" },
                { header: "Statut", value: (e: Expense) => STATUS_META[e.statut].label },
                { header: "Saisi par", value: (e: Expense) => `${e.effectuePar.prenom} ${e.effectuePar.nom}` },
                { header: "Décidé par", value: (e: Expense) => (e.approbateur ? `${e.approbateur.prenom} ${e.approbateur.nom}` : "") },
                { header: "Motif de rejet", value: (e: Expense) => e.motifRejet ?? "" },
              ],
              expenses,
              ["Total approuvé", "", "", sum("APPROUVEE"), "", "", "", ""],
            ),
          ]}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sorties approuvées" value={formatMontant(sum("APPROUVEE"))} tone="danger" icon={<CheckCircle2 size={18} />} hint={`${count("APPROUVEE")} sortie(s), comptées dans la caisse`} />
        <StatCard label="En attente de validation" value={formatMontant(sum("EN_ATTENTE"))} tone="warning" icon={<Clock size={18} />} hint={`${count("EN_ATTENTE")} sortie(s)`} />
        <StatCard label="Rejetées" value={formatMontant(sum("REJETEE"))} tone="info" icon={<XCircle size={18} />} hint={`${count("REJETEE")} sortie(s), sans effet sur la caisse`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Wallet size={18} className="text-primary" /> Historique des sorties
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
                    {e.status === "failed" ? `Refusée à l'envoi : ${e.error ?? ""}` : "En attente d'envoi au serveur"}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!loaded ? null : expenses.length === 0 ? (
            <EmptyState icon={<Wallet />} title="Aucune sortie enregistrée." />
          ) : (
            <div className="space-y-2">
              {expenses.length > 1 && (
                <div className="mb-1 flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setOpen(new Set(expenses.map((x) => x.id)))}
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
                          aria-label={`${expanded ? "Réduire" : "Développer"} ${CATEGORY_LABEL[exp.categorie]}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-surface-muted"
                        >
                          {expanded ? <Minus size={15} /> : <Plus size={15} />}
                        </button>
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {CATEGORY_LABEL[exp.categorie]} · <span className="font-semibold text-danger">- {formatMontant(exp.montant)}</span>
                          </p>
                          <p className="text-xs text-ink-muted">{formatDate(exp.dateDepense)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={meta.color}>
                          <span className="flex items-center gap-1">
                            {meta.icon} {meta.label}
                          </span>
                        </Badge>
                        {canApprove && exp.statut === "EN_ATTENTE" && (
                          <>
                            <button
                              onClick={() => void handleApprove(exp.id)}
                              className="text-xs font-medium text-success hover:underline"
                            >
                              Approuver
                            </button>
                            <button
                              onClick={() => void handleReject(exp.id)}
                              className="text-xs font-medium text-danger hover:underline"
                            >
                              Rejeter
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-ink-muted">Description</dt>
                          <dd className="font-medium text-ink">{exp.description}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">Saisi par</dt>
                          <dd className="font-medium text-ink">
                            {exp.effectuePar.prenom} {exp.effectuePar.nom}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-muted">Décision</dt>
                          <dd className="font-medium text-ink">
                            {exp.approbateur
                              ? `${exp.approbateur.prenom} ${exp.approbateur.nom}${exp.dateDecision ? `, le ${formatDate(exp.dateDecision)}` : ""}`
                              : "En attente de la Direction"}
                          </dd>
                        </div>
                        {exp.motifRejet && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-danger">Motif du rejet</dt>
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
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Enregistrer une sortie</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label="Catégorie">
                <Select
                  value={form.categorie}
                  onChange={(e) => setForm({ ...form, categorie: e.target.value as ExpenseCategory })}
                >
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Montant">
                <Input
                  type="number"
                  required
                  min={1}
                  value={form.montant}
                  onChange={(e) => setForm({ ...form, montant: e.target.value })}
                />
              </Field>
              <Field label="Description">
                <Input
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Détail de la dépense"
                />
              </Field>
              <ErrorMessage>{error}</ErrorMessage>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Enregistrement…" : "Enregistrer la sortie"}
              </Button>
              <p className="text-xs text-ink-muted">
                Toute sortie nécessite une validation de la Direction avant d&apos;être comptée dans la clôture de
                journée.
              </p>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
