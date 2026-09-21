"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { nextProvisionalNumber, useOnOutboxChange, useOutbox, type OutboxEntry } from "@/lib/outbox";
import { ExpandButton } from "@/components/expand";
import { formatDate, formatMontant } from "@/lib/format";
import type { FeeType, FinancialStatus, Invoice, InvoiceLine, Payment, SolvencyStatus } from "@/lib/types";
import { Badge, Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlusCircle,
  Printer,
  Receipt,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";

const MODE_LABEL: Record<string, string> = { ESPECES: "Espèces", MOBILE_MONEY: "Mobile Money" };

/** Élève concerné, pour le reçu provisoire imprimé quand l'encaissement se fait sans Internet. */
export interface ReceiptStudent {
  nom: string;
  prenom: string;
  matricule: string;
  classe: string;
}

const NEEDS_ONLINE = "Cette action nécessite une connexion Internet. Réessayez quand elle sera revenue.";

function describeError(err: unknown): string {
  if (isOfflineError(err)) return NEEDS_ONLINE;
  return isApiError(err) ? err.message : "Une erreur est survenue.";
}

function computeSoldeRestant(line: InvoiceLine): number {
  const remise = line.discounts
    .filter((d) => d.statut === "APPROUVEE")
    .reduce((sum, d) => sum + (d.type === "POURCENTAGE" ? Math.round((line.montant * d.valeur) / 100) : d.valeur), 0);
  const paye = (line.payments ?? []).reduce((sum, p) => sum + p.montant, 0);
  return Math.max(0, line.montant - Math.min(remise, line.montant) - paye);
}

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
  student,
  open = true,
  onToggle,
}: {
  studentId: string;
  activeEnrollmentId?: string;
  student?: ReceiptStudent;
  /** Corps développé ou non ; sans `onToggle`, la carte reste toujours développée. */
  open?: boolean;
  onToggle?: () => void;
}) {
  const { hasPermission } = useAuth();
  const canRequestDiscount = hasPermission("ENROLLMENT_MANAGE");
  const canApproveDiscount = hasPermission("DISCOUNT_APPROVE");
  const canPay = hasPermission("PAYMENT_CREATE");
  const canCancelPayment = hasPermission("PAYMENT_CANCEL_APPROVE");

  const [status, setStatus] = useState<FinancialStatus | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [discountFormLineId, setDiscountFormLineId] = useState<string | null>(null);
  const [paymentFormLineId, setPaymentFormLineId] = useState<string | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();
  const { entries } = useOutbox();

  // Encaissements saisis sur cet appareil et pas encore visibles dans l'historique du serveur.
  const knownPaymentIds = new Set(payments.map((p) => p.id));
  const pendingPayments: OutboxEntry[] = entries.filter(
    (e) =>
      e.kind === "payment" &&
      e.studentId === studentId &&
      (e.status === "pending" || (paymentsLoaded && e.status === "done" && !!e.resultId && !knownPaymentIds.has(e.resultId))),
  );
  const pendingByLine = new Map<string, number>();
  for (const e of pendingPayments) {
    if (e.invoiceLineId) pendingByLine.set(e.invoiceLineId, (pendingByLine.get(e.invoiceLineId) ?? 0) + (e.montant ?? 0));
  }
  const soldeApresAttente = (line: InvoiceLine) => Math.max(0, computeSoldeRestant(line) - (pendingByLine.get(line.id) ?? 0));
  const failedPayments = entries.filter((e) => e.kind === "payment" && e.studentId === studentId && e.status === "failed");

  async function handleReprint(paymentId: string) {
    setActionError(null);
    try {
      await api.post(`/payments/${paymentId}/reprint`);
      router.push(`/recus/${paymentId}`);
    } catch (err) {
      setActionError(describeError(err));
    }
  }

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
    const payHistory = await api.get<Payment[]>(`/payments?studentId=${studentId}`);
    setPayments(payHistory);
    setPaymentsLoaded(true);
  }

  useEffect(() => {
    void load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, activeEnrollmentId]);

  // Quand une saisie faite hors ligne est envoyée, on relit la situation réelle auprès du serveur.
  useOnOutboxChange(() => void load().catch(() => {}));

  if (!status) return null;
  const meta = STATUS_META[status.statut];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-[var(--shadow-soft)]">
      <div className={`flex flex-wrap items-center gap-3 ${open ? "mb-4" : ""}`}>
        {onToggle && <ExpandButton open={open} onClick={onToggle} label="la situation financière" />}
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Receipt size={18} />
        </div>
        <h2 className="font-display text-lg font-semibold text-ink">Situation financière</h2>
        {!open && <span className="text-xs font-medium text-ink-muted">Restant dû {formatMontant(status.montantRestant)}</span>}
        <span className="ml-auto">
          <Badge color={meta.color}>
            <span className="flex items-center gap-1">
              {meta.icon} {meta.label}
            </span>
          </Badge>
        </span>
      </div>

      {open && (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Facturé" value={formatMontant(status.montantFacture)} />
        <Metric label="Remises" value={formatMontant(status.montantRemise)} />
        <Metric label="Payé" value={formatMontant(status.montantPaye)} hint="Encaissements : Lot 4" />
        <Metric label="Restant dû" value={formatMontant(status.montantRestant)} />
      </div>

      {notice && <p className="mt-3 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{notice}</p>}
      <ErrorMessage>{actionError}</ErrorMessage>

      {status.prochaineEcheance && (
        <p className="mt-4 text-sm text-ink-muted">
          {status.prochaineEcheance.enRetard ? "Échéance en retard : " : "Prochaine échéance : "}
          <span className="font-medium text-ink">{status.prochaineEcheance.libelle}</span> —{" "}
          {formatMontant(status.prochaineEcheance.montant)} (
          {formatDate(status.prochaineEcheance.dateLimite)})
        </p>
      )}

      {invoice && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Facture de l&apos;inscription en cours</p>
            {canRequestDiscount && invoice.statut === "EMISE" && (
              <Button variant="ghost" onClick={() => setShowAddLine((v) => !v)}>
                <PlusCircle size={14} /> Autre frais
              </Button>
            )}
          </div>

          {showAddLine && (
            <AddLineForm
              invoiceId={invoice.id}
              onDone={() => {
                setShowAddLine(false);
                void load();
              }}
            />
          )}

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

              {(() => {
                const soldeRestant = soldeApresAttente(line);
                const enAttente = pendingByLine.get(line.id) ?? 0;
                if (soldeRestant <= 0) {
                  return (
                    <p className="mt-2 text-xs font-medium text-success">
                      Ligne soldée{enAttente > 0 ? " (paiement en attente d'envoi au serveur)" : ""}.
                    </p>
                  );
                }
                return (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-ink-muted">
                      Solde restant : {formatMontant(soldeRestant)}
                      {enAttente > 0 && <> (dont {formatMontant(enAttente)} déjà encaissés hors ligne, en attente)</>}
                    </p>
                    {canPay && (
                      <Button
                        variant="accent"
                        onClick={() => setPaymentFormLineId((v) => (v === line.id ? null : line.id))}
                      >
                        <Wallet size={15} /> Payer
                      </Button>
                    )}
                  </div>
                );
              })()}

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
                  onDone={(queued) => {
                    setDiscountFormLineId(null);
                    if (queued) setNotice("Demande de remise enregistrée sur cet appareil : elle sera envoyée au retour d'Internet.");
                    void load();
                  }}
                />
              )}

              {paymentFormLineId === line.id && (
                <PaymentForm
                  invoiceLineId={line.id}
                  invoiceLineLabel={line.libelle}
                  studentId={studentId}
                  student={student}
                  soldeRestant={soldeApresAttente(line)}
                  onDone={() => {
                    setPaymentFormLineId(null);
                    void load();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {(pendingPayments.length > 0 || failedPayments.length > 0) && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-ink">Encaissements saisis hors ligne</p>
          {pendingPayments.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-3 text-sm">
              <div>
                <p className="font-medium text-ink">
                  {e.receipt?.numero} — {formatMontant(e.montant ?? 0)}
                </p>
                <p className="text-xs text-ink-muted">
                  {e.status === "done" ? "Envoyé, mise à jour en cours" : "En attente d'envoi au serveur"} · {e.receipt?.motif}
                </p>
              </div>
              <Link href={`/recus/provisoire/${e.id}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Printer size={13} /> Reçu provisoire
              </Link>
            </div>
          ))}
          {failedPayments.map((e) => (
            <div key={e.id} className="rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-sm">
              <p className="font-medium text-danger">
                {e.receipt?.numero} — {formatMontant(e.montant ?? 0)} : refusé par le serveur
              </p>
              <p className="text-xs text-ink-muted">
                {e.error}{" "}
                <Link href="/hors-ligne" className="font-medium text-primary hover:underline">
                  Voir « Synchronisation »
                </Link>
              </p>
            </div>
          ))}
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-ink">Historique des paiements</p>
          {payments.map((p) => (
            <div
              key={p.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm ${
                p.statut === "ANNULE" ? "border-danger/30 bg-danger-soft/40" : "border-border"
              }`}
            >
              <div>
                <p className="font-medium text-ink">
                  {p.numeroRecu} — {formatMontant(p.montant)}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatDate(p.datePaiement)} · {MODE_LABEL[p.modePaiement] ?? p.modePaiement} ·{" "}
                  {p.invoiceLine?.libelle ?? "—"}
                  {p.statut === "ANNULE" && <> · Annulé{p.motifAnnulation ? ` : ${p.motifAnnulation}` : ""}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canPay && (
                  <button
                    onClick={() => void handleReprint(p.id)}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Printer size={13} /> Réimprimer
                  </button>
                )}
                {canCancelPayment && p.statut === "VALIDE" && (
                  <button
                    onClick={async () => {
                      const motif = prompt("Motif de l'annulation :");
                      if (!motif) return;
                      setActionError(null);
                      try {
                        await api.post(`/payments/${p.id}/cancel`, { motif });
                        await load();
                      } catch (err) {
                        setActionError(describeError(err));
                      }
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-danger hover:underline"
                  >
                    <XCircle size={13} /> Annuler
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
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

function DiscountRequestForm({ invoiceLineId, onDone }: { invoiceLineId: string; onDone: (queued: boolean) => void }) {
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
      const res = await submitOrQueue({
        kind: "discount",
        method: "POST",
        path: "/discounts",
        body: { invoiceLineId, type, valeur: Number(valeur), motif },
        label: `Remise ${type === "POURCENTAGE" ? `${valeur} %` : formatMontant(Number(valeur))} : ${motif}`,
        invoiceLineId,
      });
      onDone(res.queued);
    } catch (err) {
      setError(describeError(err));
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

function PaymentForm({
  invoiceLineId,
  invoiceLineLabel,
  studentId,
  student,
  soldeRestant,
  onDone,
}: {
  invoiceLineId: string;
  invoiceLineLabel: string;
  studentId: string;
  student?: ReceiptStudent;
  soldeRestant: number;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [montant, setMontant] = useState(String(soldeRestant));
  const [modePaiement, setModePaiement] = useState<"ESPECES" | "MOBILE_MONEY">("ESPECES");
  const [referenceExterne, setReferenceExterne] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const amount = Number(montant);
      const reference = modePaiement === "MOBILE_MONEY" ? referenceExterne : undefined;
      const baseBody = { invoiceLineId, montant: amount, modePaiement, referenceExterne: reference };
      const res = await submitOrQueue<Payment>(
        {
          kind: "payment",
          method: "POST",
          path: "/payments",
          body: baseBody,
          label: `${student ? `${student.prenom} ${student.nom}` : "Élève"} : ${invoiceLineLabel}`,
          studentId,
          invoiceLineId,
          montant: amount,
        },
        // Sans Internet : numéro de reçu provisoire, date de saisie et instantané du reçu à imprimer.
        () => {
          const numero = nextProvisionalNumber();
          const now = new Date().toISOString();
          return {
            body: { ...baseBody, numeroProvisoire: numero, dateSaisie: now },
            receipt: {
              numero,
              eleve: student ? `${student.prenom} ${student.nom}` : "Élève",
              matricule: student?.matricule ?? "—",
              classe: student?.classe ?? "—",
              motif: invoiceLineLabel,
              montant: amount,
              modePaiement,
              referenceExterne: reference,
              caissier: user ? `${user.prenom} ${user.nom}` : "—",
              date: now,
            },
          };
        },
      );
      onDone();
      router.push(res.queued ? `/recus/provisoire/${res.entry.id}` : `/recus/${res.result.id}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-xl bg-surface-muted p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Montant">
          <Input
            type="number"
            required
            min={1}
            max={soldeRestant}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </Field>
        <Field label="Mode de paiement">
          <Select value={modePaiement} onChange={(e) => setModePaiement(e.target.value as typeof modePaiement)}>
            <option value="ESPECES">Espèces</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
          </Select>
        </Field>
      </div>
      {modePaiement === "MOBILE_MONEY" && (
        <Field label="Référence externe">
          <Input
            required
            value={referenceExterne}
            onChange={(e) => setReferenceExterne(e.target.value)}
            placeholder="Numéro de transaction"
          />
        </Field>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" variant="accent" disabled={submitting}>
        {submitting ? "Encaissement…" : "Encaisser et imprimer le reçu"}
      </Button>
    </form>
  );
}

function AddLineForm({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [feeTypeId, setFeeTypeId] = useState("");
  const [montant, setMontant] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void api.get<FeeType[]>("/fee-types").then((data) => {
      const selectable = data.filter((ft) => !ft.avecTranches);
      setFeeTypes(selectable);
      setFeeTypeId(selectable[0]?.id ?? "");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/invoices/${invoiceId}/lines`, { feeTypeId, montant: Number(montant) });
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl bg-surface-muted p-3">
      <p className="text-xs text-ink-muted">
        Frais ponctuel (tenue, livres, cantine…) — configurez d&apos;abord le type dans{" "}
        <span className="font-medium text-ink">Tarifs &amp; facturation</span> s&apos;il n&apos;existe pas encore.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Select value={feeTypeId} onChange={(e) => setFeeTypeId(e.target.value)} required>
          {feeTypes.map((ft) => (
            <option key={ft.id} value={ft.id}>
              {ft.nom}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          required
          min={1}
          placeholder="Montant"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
        />
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" disabled={submitting || !feeTypeId}>
        {submitting ? "Ajout…" : "Ajouter à la facture"}
      </Button>
    </form>
  );
}

function DiscountDecisionButtons({ discountId, onDecided }: { discountId: string; onDecided: () => void }) {
  async function approve() {
    try {
      await api.post(`/discounts/${discountId}/approve`);
      onDecided();
    } catch (err) {
      alert(describeError(err));
    }
  }
  async function reject() {
    const motifRejet = prompt("Motif du rejet :");
    if (!motifRejet) return;
    try {
      await api.post(`/discounts/${discountId}/reject`, { motifRejet });
      onDecided();
    } catch (err) {
      alert(describeError(err));
    }
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
