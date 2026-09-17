"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import { CheckCircle2, Clock, Wallet, XCircle } from "lucide-react";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  VERSEMENT_BANQUE: "Versement banque",
  PAIEMENT_SALAIRE: "Paiement salaire",
  PAIEMENT_FACTURE: "Paiement facture",
  ACHAT_MATERIEL: "Achat matériel",
  AUTRE: "Autre",
};

const STATUS_META: Record<Expense["statut"], { label: string; color: "orange" | "green" | "red"; icon: React.ReactNode }> = {
  EN_ATTENTE: { label: "En attente", color: "orange", icon: <Clock size={13} /> },
  APPROUVEE: { label: "Approuvée", color: "green", icon: <CheckCircle2 size={13} /> },
  REJETEE: { label: "Rejetée", color: "red", icon: <XCircle size={13} /> },
};

export default function ExpensesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("EXPENSE_CREATE");
  const canApprove = hasPermission("EXPENSE_APPROVE");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ categorie: "ACHAT_MATERIEL" as ExpenseCategory, montant: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const data = await api.get<Expense[]>("/expenses");
    setExpenses(data);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/expenses", { ...form, montant: Number(form.montant) });
      setForm({ categorie: "ACHAT_MATERIEL", montant: "", description: "" });
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string) {
    await api.post(`/expenses/${id}/approve`);
    await load();
  }

  async function handleReject(id: string) {
    const motif = prompt("Motif du rejet :");
    if (!motif) return;
    await api.post(`/expenses/${id}/reject`, { motif });
    await load();
  }

  return (
    <div>
      <PageTitle eyebrow="Lot 5" subtitle="Versements, salaires, factures, achats de matériel et autres sorties.">
        Sorties financières
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Wallet size={18} className="text-primary" /> Historique des sorties
          </h2>
          {!loaded ? null : expenses.length === 0 ? (
            <EmptyState icon={<Wallet />} title="Aucune sortie enregistrée." />
          ) : (
            <div className="space-y-2">
              {expenses.map((exp) => {
                const meta = STATUS_META[exp.statut];
                return (
                  <div key={exp.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {CATEGORY_LABEL[exp.categorie]} — {formatMontant(exp.montant)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(exp.dateDepense)} · {exp.description} · {exp.effectuePar.prenom}{" "}
                          {exp.effectuePar.nom}
                        </p>
                        {exp.motifRejet && <p className="text-xs text-danger">Rejet : {exp.motifRejet}</p>}
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
