"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Smartphone, XCircle } from "lucide-react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, ErrorMessage, Field, Input, Spinner } from "@/components/ui";
import { formatDate, formatMontant } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";

export interface PayableTranche {
  trancheId: string;
  libelle: string;
  montant: number;
  solde: number;
  dateLimite: string;
  enRetard: boolean;
  enAttente: { id: string; montant: number } | null;
}

interface OnlinePaymentState {
  id: string;
  statut: "EN_ATTENTE" | "CONFIRME" | "ECHOUE" | "A_TRAITER";
  montant: number;
  motifEchec: string | null;
  paiement: { id: string; numeroRecu: string } | null;
}

const POLL_MS = 5000;
// Au-delà, on arrête de sonder : le parent peut fermer la page, la situation se mettra à jour à la confirmation.
const POLL_MAX_MS = 2 * 60 * 1000;

/** Suivi d'un paiement lancé : attend la confirmation sur le téléphone, puis affiche le résultat. */
function PaymentTracker({
  studentId,
  paymentId,
  onDone,
  onRetry,
}: {
  studentId: string;
  paymentId: string;
  onDone: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<OnlinePaymentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const finished = useRef(false);
  // Le rappel change à chaque rendu du parent : on le lit par une référence pour ne pas relancer le sondage.
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const check = useCallback(async () => {
    try {
      const s = await portalApi.get<OnlinePaymentState>(`/portal/payments/${paymentId}`);
      setState(s);
      setError(null);
      if (s.statut !== "EN_ATTENTE" && !finished.current) {
        finished.current = true;
        doneRef.current();
      }
      return s.statut !== "EN_ATTENTE";
    } catch (e) {
      setError(describePortalError(e));
      return false;
    }
  }, [paymentId]);

  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const over = await check();
      if (!alive || over) return;
      if (Date.now() - startedAt > POLL_MAX_MS) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [check]);

  if (!state && !error) return <Spinner />;
  return (
    <div className="space-y-2" aria-live="polite">
      <ErrorMessage>{error}</ErrorMessage>
      {state?.statut === "EN_ATTENTE" && (
        <div className="flex items-start gap-3 rounded-xl bg-info-soft px-3 py-3 text-sm text-info">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t("parent.pay.confirmTitle")}</p>
            <p>{t("parent.pay.confirmBody", { amount: formatMontant(state.montant) })}</p>
            {gaveUp && <p className="mt-2">{t("parent.pay.stillWaiting")}</p>}
          </div>
        </div>
      )}
      {state?.statut === "CONFIRME" && (
        <div className="flex items-start gap-3 rounded-xl bg-success-soft px-3 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t("parent.pay.confirmed", { amount: formatMontant(state.montant) })}</p>
            {state.paiement && (
              <p>
                {t("parent.pay.receipt", { number: state.paiement.numeroRecu })}{" "}
                <Link className="font-medium underline" href={`/parents/enfant/${studentId}/recu/${state.paiement.id}`}>
                  {t("parent.pay.viewReceipt")}
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
      {state?.statut === "ECHOUE" && (
        <div className="flex items-start gap-3 rounded-xl bg-danger-soft px-3 py-3 text-sm text-danger">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t("parent.pay.failed")}</p>
            <p>{state.motifEchec ?? t("parent.pay.retryHint")}</p>
            <Button type="button" variant="secondary" className="mt-2" onClick={onRetry}>
              {t("parent.pay.retry")}
            </Button>
          </div>
        </div>
      )}
      {state?.statut === "A_TRAITER" && (
        <div className="flex items-start gap-3 rounded-xl bg-warning-soft px-3 py-3 text-sm text-warning">
          <div>
            <p className="font-semibold">{t("parent.pay.toProcess")}</p>
            <p>{t("parent.pay.toProcessBody")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Les tranches encore à payer, avec le paiement Mobile Money quand l'école l'a activé. */
export function PayTranches({
  studentId,
  tranches,
  defaultPhone,
  onChanged,
}: {
  studentId: string;
  tranches: PayableTranche[];
  defaultPhone: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [montant, setMontant] = useState("");
  const [telephone, setTelephone] = useState(defaultPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Paiement suivi pour une tranche donnée (lancé à l'instant, ou déjà en attente au chargement).
  const [tracked, setTracked] = useState<Record<string, string>>({});
  // Une tranche entièrement payée disparaît de la liste au rechargement : on garde sa ligne pour que le
  // parent voie le résultat (reçu) au lieu d'un affichage qui s'évanouit.
  const [finished, setFinished] = useState<Record<string, PayableTranche>>({});

  const shown = [...tranches, ...Object.values(finished).filter((f) => !tranches.some((tr) => tr.trancheId === f.trancheId))];
  if (shown.length === 0) return null;

  const open = (tr: PayableTranche) => {
    setOpenId(tr.trancheId);
    setMontant(String(tr.solde));
    setError(null);
  };

  const submit = async (tr: PayableTranche) => {
    const amount = Number(montant);
    if (!Number.isInteger(amount) || amount < 1) {
      setError(t("parent.pay.wholeAmount"));
      return;
    }
    if (amount > tr.solde) {
      setError(t("parent.pay.tooMuch", { amount: formatMontant(tr.solde) }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi.post<{ id: string }>(`/portal/children/${studentId}/payments`, {
        trancheId: tr.trancheId,
        montant: amount,
        telephone,
      });
      setTracked((prev) => ({ ...prev, [tr.trancheId]: res.id }));
      setOpenId(null);
    } catch (e) {
      setError(describePortalError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <h2 className="font-display text-base font-semibold text-ink">{t("parent.pay.title")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("parent.pay.intro")}</p>
      <ul className="mt-3 space-y-3">
        {shown.map((tr) => {
          const paymentId = tracked[tr.trancheId] ?? tr.enAttente?.id ?? null;
          return (
            <li key={tr.trancheId} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{tr.libelle}</p>
                  <p className="text-sm text-ink-muted">{t("parent.pay.left", { amount: formatMontant(tr.solde), date: formatDate(tr.dateLimite) })}</p>
                </div>
                <div className="flex items-center gap-2">
                  {tr.enRetard && <Badge color="orange">{t("parent.pay.late")}</Badge>}
                  {!paymentId && openId !== tr.trancheId && <Button onClick={() => open(tr)}>{t("parent.pay.pay")}</Button>}
                </div>
              </div>

              {paymentId && (
                <div className="mt-3">
                  <PaymentTracker
                    studentId={studentId}
                    paymentId={paymentId}
                    onDone={() => {
                      setFinished((prev) => ({ ...prev, [tr.trancheId]: tr }));
                      onChanged();
                    }}
                    onRetry={() => {
                      // Une tentative échouée libère la tranche : on retire le suivi et on rouvre le formulaire.
                      setTracked((prev) => {
                        const next = { ...prev };
                        delete next[tr.trancheId];
                        return next;
                      });
                      setFinished((prev) => {
                        const next = { ...prev };
                        delete next[tr.trancheId];
                        return next;
                      });
                      open(tr);
                    }}
                  />
                </div>
              )}

              {!paymentId && openId === tr.trancheId && (
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(tr);
                  }}
                >
                  <Field label={t("parent.pay.amountLabel")}>
                    <Input inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))} required />
                  </Field>
                  <Field label={t("parent.pay.phoneLabel")}>
                    <Input inputMode="tel" autoComplete="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} required />
                  </Field>
                  <ErrorMessage>{error}</ErrorMessage>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>
                      {busy ? t("parent.pay.sending") : montant ? t("parent.pay.payAmount", { amount: formatMontant(Number(montant)) }) : t("parent.pay.pay")}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setOpenId(null)} disabled={busy}>
                      {t("parent.pay.cancel")}
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
