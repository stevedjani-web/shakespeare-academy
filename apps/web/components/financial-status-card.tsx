"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import type { FinancialStatus, Invoice, SolvencyStatus } from "@/lib/types";
import { Badge, Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { AlertTriangle, CheckCircle2, Clock, Receipt, ShieldCheck } from "lucide-react";

const STATUS_META: Record<SolvencyStatus, { label: string; color: "green" | "blue" | "orange" | "red" | "slate"; icon: React.ReactNode }> = {
  SOLVABLE: { label: "Solvable", color: "green", icon: <CheckCircle2 size={16} /> },
  A_ECHOIR: { label: "À échoir", color: "blue", icon: <Clock size={16} /> },
  EN_RETARD: { label: "En retard", color: "orange", icon: <AlertTriangle size={16} /> },
  IMPAYE_CRITIQUE: { label: "Impayé critique", color: "red", icon: <AlertTriangle size={16} /> },
  EXONERE: { label: "Exonéré", color: "slate", icon: <ShieldCheck size={16} /> },
};

export function FinancialStatusCard({
  studentId,
  activeEnrollmentId,
}: {
  studentId: string;
  activeEnrollmentId?: string;
}) {
  const { hasPermission } = useAuth();
  const canRequestDiscount = hasPermission("ENROLLMENT_MANAGE");
  const canApproveDiscount = hasPermission("DISCOUNT_APPROVE");

  const [status, setStatus] = useState<FinancialStatus | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [discountFormLineId, setDiscountFormLineId] = useState<string | null>(null);

  async function load() {
    const data = await api.get<FinancialStatus>(`/students/${studentId}/financial-status`);
    setStatus(data);
    if (activeEnrollmentId) {
      try {
        const inv = await api.get<Invoice>(`/invoices/by-enrollment/${activeEnrollmentId}`);
        setInvoice(inv);
      } catch {
        setInvoice(null);
      }
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, activeEnrollmentId]);

  if (!status) return null;
  const meta = STATUS_META[status.statut];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Receipt size={18} />
        </div>
        <h2 className="font-display text-lg font-semibold text-ink">Situation financière</h2>
        <span className="ml-auto">
          <Badge color={meta.color}>
            <span className="flex items-center gap-1">
              {meta.icon} {meta.label}
            </span>
          </Badge>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Facturé" value={formatMontant(status.montantFacture)} />
        <Metric label="Remises" value={formatMontant(status.montantRemise)} />
        <Metric label="Payé" value={formatMontant(status.montantPaye)} hint="Encaissements : Lot 4" />
        <Metric label="Restant dû" value={formatMontant(status.montantRestant)} />
      </div>

      {status.prochaineEcheance && (
        <p className="mt-4 text-sm text-ink-muted">
          {status.prochaineEcheance.enRetard ? "Échéance en retard : " : "Prochaine échéance : "}
          <span className="font-medium text-ink">{status.prochaineEcheance.libelle}</span> —{" "}
          {formatMontant(status.prochaineEcheance.montant)} (
          {formatDate(status.prochaineEcheance.dateLimite)})
        </p>
      )}

      {invoice && invoice.lines.length > 0 && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-ink">Facture de l&apos;inscription en cours</p>
          {invoice.lines.map((line) => (
            <div key={line.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">{line.libelle}</p>
                  {line.dateEcheance && (
                    <p className="text-xs text-ink-muted">Échéance : {formatDate(line.dateEcheance)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{formatMontant(line.montant)}</span>
                  {canRequestDiscount && (
                    <Button
                      variant="ghost"
                      onClick={() => setDiscountFormLineId((v) => (v === line.id ? null : line.id))}
                    >
                      Demander une remise
                    </Button>
                  )}
                </div>
              </div>

              {line.discounts.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {line.discounts.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-ink-muted">
                        {d.type === "POURCENTAGE" ? `${d.valeur}%` : formatMontant(d.valeur)} — {d.motif}
                        {d.motifRejet && <> · Rejet : {d.motifRejet}</>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge
                          color={d.statut === "APPROUVEE" ? "green" : d.statut === "REJETEE" ? "red" : "orange"}
                        >
                          {d.statut === "EN_ATTENTE" ? "En attente" : d.statut === "APPROUVEE" ? "Approuvée" : "Rejetée"}
                        </Badge>
                        {canApproveDiscount && d.statut === "EN_ATTENTE" && (
                          <DiscountDecisionButtons discountId={d.id} onDecided={load} />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {discountFormLineId === line.id && (
                <DiscountRequestForm
                  invoiceLineId={line.id}
                  onDone={() => {
                    setDiscountFormLineId(null);
                    void load();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

function DiscountRequestForm({ invoiceLineId, onDone }: { invoiceLineId: string; onDone: () => void }) {
  const [type, setType] = useState<"MONTANT_FIXE" | "POURCENTAGE">("MONTANT_FIXE");
  const [valeur, setValeur] = useState("");
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/discounts", { invoiceLineId, type, valeur: Number(valeur), motif });
      onDone();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-xl bg-surface-muted p-3">
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="MONTANT_FIXE">Montant fixe</option>
          <option value="POURCENTAGE">Pourcentage</option>
        </Select>
        <Input
          type="number"
          required
          placeholder={type === "POURCENTAGE" ? "% (0-100)" : "Montant"}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
        />
      </div>
      <Field label="Motif">
        <Input required value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Fratrie, difficulté..." />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Envoi…" : "Envoyer la demande"}
      </Button>
    </form>
  );
}

function DiscountDecisionButtons({ discountId, onDecided }: { discountId: string; onDecided: () => void }) {
  async function approve() {
    await api.post(`/discounts/${discountId}/approve`);
    onDecided();
  }
  async function reject() {
    const motifRejet = prompt("Motif du rejet :");
    if (!motifRejet) return;
    await api.post(`/discounts/${discountId}/reject`, { motifRejet });
    onDecided();
  }
  return (
    <span className="flex gap-1">
      <button onClick={() => void approve()} className="text-success hover:underline">
        Approuver
      </button>
      <button onClick={() => void reject()} className="text-danger hover:underline">
        Rejeter
      </button>
    </span>
  );
}
