"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { nextProvisionalNumber, useOnOutboxChange, useOutbox, type OutboxEntry } from "@/lib/outbox";
import { ExpandButton } from "@/components/expand";
import { HelpTip } from "@/components/help-tip";
import { formatDate, formatMontant } from "@/lib/format";
import { translate, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
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

const MODE_KEY: Record<string, MessageKey> = { ESPECES: "fin.mode.ESPECES", MOBILE_MONEY: "fin.mode.MOBILE_MONEY" };
const DISCOUNT_STATUS_KEY: Record<"EN_ATTENTE" | "APPROUVEE" | "REJETEE", MessageKey> = {
  EN_ATTENTE: "fin.status.EN_ATTENTE",
  APPROUVEE: "fin.status.APPROUVEE",
  REJETEE: "fin.status.REJETEE",
};
const DISCOUNT_TYPE_KEY: Record<"MONTANT_FIXE" | "POURCENTAGE", MessageKey> = {
  MONTANT_FIXE: "fin.card.discountType.MONTANT_FIXE",
  POURCENTAGE: "fin.card.discountType.POURCENTAGE",
};

/** Élève concerné, pour le reçu provisoire imprimé quand l'encaissement se fait sans Internet. */
export interface ReceiptStudent {
  nom: string;
  prenom: string;
  matricule: string;
  classe: string;
}

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("fin.needsOnline");
  return isApiError(err) ? err.message : translate("common.error");
}

function computeSoldeRestant(line: InvoiceLine): number {
  const remise = line.discounts
    .filter((d) => d.statut === "APPROUVEE")
    .reduce((sum, d) => sum + (d.type === "POURCENTAGE" ? Math.round((line.montant * d.valeur) / 100) : d.valeur), 0);
  const paye = (line.payments ?? []).reduce((sum, p) => sum + p.montant, 0);
  return Math.max(0, line.montant - Math.min(remise, line.montant) - paye);
}

// Exporté pour StudentSummaryStrip (vue 360° du dossier élève), même badge que sur cette carte.
// `label` est un accesseur : le texte est résolu dans la langue courante à chaque lecture, jamais figé au chargement.
export const STATUS_META: Record<SolvencyStatus, { label: string; color: "green" | "blue" | "orange" | "red" | "slate"; icon: React.ReactNode }> = {
  SOLVABLE: {
    get label() {
      return translate("fin.solvency.SOLVABLE");
    },
    color: "green",
    icon: <CheckCircle2 size={16} />,
  },
  A_ECHOIR: {
    get label() {
      return translate("fin.solvency.A_ECHOIR");
    },
    color: "blue",
    icon: <Clock size={16} />,
  },
  EN_RETARD: {
    get label() {
      return translate("fin.solvency.EN_RETARD");
    },
    color: "orange",
    icon: <AlertTriangle size={16} />,
  },
  IMPAYE_CRITIQUE: {
    get label() {
      return translate("fin.solvency.IMPAYE_CRITIQUE");
    },
    color: "red",
    icon: <AlertTriangle size={16} />,
  },
  EXONERE: {
    get label() {
      return translate("fin.solvency.EXONERE");
    },
    color: "slate",
    icon: <ShieldCheck size={16} />,
  },
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
  const { t } = useI18n();
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
        {onToggle && <ExpandButton open={open} onClick={onToggle} label={t("fin.card.expandLabel")} />}
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Receipt size={18} />
        </div>
        <h2 className="font-display text-lg font-semibold text-ink">{t("fin.card.title")}</h2>
        {open && <HelpTip id="eleves-dossier-paiements" />}
        {!open && (
          <span className="text-xs font-medium text-ink-muted">
            {t("fin.card.remaining", { amount: formatMontant(status.montantRestant) })}
          </span>
        )}
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
        <Metric label={t("fin.metric.billed")} value={formatMontant(status.montantFacture)} />
        <Metric label={t("fin.metric.discounts")} value={formatMontant(status.montantRemise)} />
        <Metric label={t("fin.metric.paid")} value={formatMontant(status.montantPaye)} hint={t("fin.metric.paidHint")} />
        <Metric label={t("fin.metric.remaining")} value={formatMontant(status.montantRestant)} />
      </div>

      {notice && <p className="mt-3 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{notice}</p>}
      <ErrorMessage>{actionError}</ErrorMessage>

      {status.prochaineEcheance && (
        <p className="mt-4 text-sm text-ink-muted">
          {status.prochaineEcheance.enRetard ? t("fin.card.overdueDue") : t("fin.card.nextDue")}{" "}
          <span className="font-medium text-ink">{status.prochaineEcheance.libelle}</span> —{" "}
          {formatMontant(status.prochaineEcheance.montant)} (
          {formatDate(status.prochaineEcheance.dateLimite)})
        </p>
      )}

      {invoice && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{t("fin.card.invoiceTitle")}</p>
            {canRequestDiscount && invoice.statut === "EMISE" && (
              <Button variant="ghost" onClick={() => setShowAddLine((v) => !v)}>
                <PlusCircle size={14} /> {t("fin.card.otherFee")}
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
                    <p className="text-xs text-ink-muted">{t("fin.card.dueDate", { date: formatDate(line.dateEcheance) })}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{formatMontant(line.montant)}</span>
                  {canRequestDiscount && (
                    <Button
                      variant="ghost"
                      onClick={() => setDiscountFormLineId((v) => (v === line.id ? null : line.id))}
                    >
                      {t("fin.card.requestDiscount")}
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
                      {enAttente > 0 ? t("fin.card.lineSettledPending") : t("fin.card.lineSettled")}
                    </p>
                  );
                }
                return (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-ink-muted">
                      {t("fin.card.balanceLeft", { amount: formatMontant(soldeRestant) })}
                      {enAttente > 0 && <> {t("fin.card.offlineCollected", { amount: formatMontant(enAttente) })}</>}
                    </p>
                    {canPay && (
                      <Button
                        variant="accent"
                        onClick={() => setPaymentFormLineId((v) => (v === line.id ? null : line.id))}
                      >
                        <Wallet size={15} /> {t("fin.card.pay")}
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
                        {d.motifRejet && <> · {t("fin.card.rejection", { reason: d.motifRejet })}</>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge
                          color={d.statut === "APPROUVEE" ? "green" : d.statut === "REJETEE" ? "red" : "orange"}
                        >
                          {t(DISCOUNT_STATUS_KEY[d.statut])}
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
                    if (queued) setNotice(t("fin.card.discountQueued"));
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
          <p className="text-sm font-semibold text-ink">{t("fin.card.offlineTitle")}</p>
          {pendingPayments.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-3 text-sm">
              <div>
                <p className="font-medium text-ink">
                  {e.receipt?.numero} — {formatMontant(e.montant ?? 0)}
                </p>
                <p className="text-xs text-ink-muted">
                  {e.status === "done" ? t("fin.card.sentUpdating") : t("fin.awaitingSend")} · {e.receipt?.motif}
                </p>
              </div>
              <Link href={`/recus/provisoire/${e.id}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Printer size={13} /> {t("fin.card.provisionalReceipt")}
              </Link>
            </div>
          ))}
          {failedPayments.map((e) => (
            <div key={e.id} className="rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-sm">
              <p className="font-medium text-danger">
                {t("fin.card.refusedByServer", { number: e.receipt?.numero ?? "", amount: formatMontant(e.montant ?? 0) })}
              </p>
              <p className="text-xs text-ink-muted">
                {e.error}{" "}
                <Link href="/hors-ligne" className="font-medium text-primary hover:underline">
                  {t("fin.card.seeSync")}
                </Link>
              </p>
            </div>
          ))}
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-ink">{t("fin.card.historyTitle")}</p>
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
                  {formatDate(p.datePaiement)} · {MODE_KEY[p.modePaiement] ? t(MODE_KEY[p.modePaiement]) : p.modePaiement} ·{" "}
                  {p.invoiceLine?.libelle ?? "—"}
                  {p.statut === "ANNULE" && (
                    <> · {p.motifAnnulation ? t("fin.card.cancelledReason", { reason: p.motifAnnulation }) : t("fin.card.cancelled")}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canPay && (
                  <button
                    onClick={() => void handleReprint(p.id)}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Printer size={13} /> {t("fin.card.reprint")}
                  </button>
                )}
                {canCancelPayment && p.statut === "VALIDE" && (
                  <button
                    onClick={async () => {
                      const motif = prompt(t("fin.card.cancelPrompt"));
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
                    <XCircle size={13} /> {t("fin.cancel")}
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
  const { t } = useI18n();
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
        label: t("fin.card.discountLabel", {
          value: type === "POURCENTAGE" ? `${valeur} %` : formatMontant(Number(valeur)),
          reason: motif,
        }),
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
          <option value="MONTANT_FIXE">{t(DISCOUNT_TYPE_KEY.MONTANT_FIXE)}</option>
          <option value="POURCENTAGE">{t(DISCOUNT_TYPE_KEY.POURCENTAGE)}</option>
        </Select>
        <Input
          type="number"
          required
          placeholder={type === "POURCENTAGE" ? t("fin.card.percentPlaceholder") : t("fin.f.amount")}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
        />
      </div>
      <Field label={t("fin.card.reason")}>
        <Input required value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("fin.card.reasonPlaceholder")} />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" disabled={submitting}>
        {submitting ? t("fin.sending") : t("fin.card.sendRequest")}
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
  const { t } = useI18n();
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
      const studentName = student ? `${student.prenom} ${student.nom}` : t("fin.student");
      const res = await submitOrQueue<Payment>(
        {
          kind: "payment",
          method: "POST",
          path: "/payments",
          body: baseBody,
          label: t("fin.card.paymentLabel", { student: studentName, line: invoiceLineLabel }),
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
              eleve: studentName,
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
        <Field label={t("fin.f.amount")}>
          <Input
            type="number"
            required
            min={1}
            max={soldeRestant}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </Field>
        <Field label={t("fin.card.paymentMethod")}>
          <Select value={modePaiement} onChange={(e) => setModePaiement(e.target.value as typeof modePaiement)}>
            <option value="ESPECES">{t("fin.mode.ESPECES")}</option>
            <option value="MOBILE_MONEY">{t("fin.mode.MOBILE_MONEY")}</option>
          </Select>
        </Field>
      </div>
      {modePaiement === "MOBILE_MONEY" && (
        <Field label={t("fin.card.externalRef")}>
          <Input
            required
            value={referenceExterne}
            onChange={(e) => setReferenceExterne(e.target.value)}
            placeholder={t("fin.card.transactionNumber")}
          />
        </Field>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" variant="accent" disabled={submitting}>
        {submitting ? t("fin.card.collecting") : t("fin.card.collectAndPrint")}
      </Button>
    </form>
  );
}

function AddLineForm({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const { t } = useI18n();
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
        {t("fin.card.addLineHint1")} <span className="font-medium text-ink">{t("fin.tariffs.title")}</span>{" "}
        {t("fin.card.addLineHint2")}
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
          placeholder={t("fin.f.amount")}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
        />
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" disabled={submitting || !feeTypeId}>
        {submitting ? t("fin.card.adding") : t("fin.card.addToInvoice")}
      </Button>
    </form>
  );
}

function DiscountDecisionButtons({ discountId, onDecided }: { discountId: string; onDecided: () => void }) {
  const { t } = useI18n();
  async function approve() {
    try {
      await api.post(`/discounts/${discountId}/approve`);
      onDecided();
    } catch (err) {
      alert(describeError(err));
    }
  }
  async function reject() {
    const motifRejet = prompt(t("fin.rejectPrompt"));
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
        {t("fin.approve")}
      </button>
      <button onClick={() => void reject()} className="text-danger hover:underline">
        {t("fin.reject")}
      </button>
    </span>
  );
}
