"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Smartphone, XCircle } from "lucide-react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Button, Card, ErrorMessage, Field, Input, Spinner } from "@/components/ui";
import { formatMontant } from "@/lib/format";

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

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** Suivi d'un paiement lancé : attend la confirmation sur le téléphone, puis affiche le résultat. */
function PaymentTracker({ studentId, paymentId, onDone }: { studentId: string; paymentId: string; onDone: () => void }) {
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
            <p className="font-semibold">Confirmez le paiement sur votre téléphone</p>
            <p>
              Un message de votre opérateur vous demande de valider {formatMontant(state.montant)} avec votre code secret. Cette page se met à jour
              toute seule.
            </p>
            {gaveUp && (
              <p className="mt-2">
                Toujours en attente. Vous pouvez quitter cette page : votre situation sera mise à jour dès que le paiement sera confirmé.
              </p>
            )}
          </div>
        </div>
      )}
      {state?.statut === "CONFIRME" && (
        <div className="flex items-start gap-3 rounded-xl bg-success-soft px-3 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Paiement confirmé : {formatMontant(state.montant)}</p>
            {state.paiement && (
              <p>
                Reçu {state.paiement.numeroRecu}.{" "}
                <Link className="font-medium underline" href={`/parents/enfant/${studentId}/recu/${state.paiement.id}`}>
                  Voir le reçu
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
            <p className="font-semibold">Le paiement n&apos;a pas abouti</p>
            <p>{state.motifEchec ?? "Réessayez ou contactez le secrétariat."}</p>
          </div>
        </div>
      )}
      {state?.statut === "A_TRAITER" && (
        <div className="flex items-start gap-3 rounded-xl bg-warning-soft px-3 py-3 text-sm text-warning">
          <div>
            <p className="font-semibold">Paiement reçu, en cours de traitement</p>
            <p>Votre paiement est bien arrivé, mais la tranche a été réglée entre-temps. Le secrétariat vous contactera pour régulariser.</p>
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

  const shown = [...tranches, ...Object.values(finished).filter((f) => !tranches.some((t) => t.trancheId === f.trancheId))];
  if (shown.length === 0) return null;

  const open = (t: PayableTranche) => {
    setOpenId(t.trancheId);
    setMontant(String(t.solde));
    setError(null);
  };

  const submit = async (t: PayableTranche) => {
    const amount = Number(montant);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Saisissez un montant entier, sans virgule.");
      return;
    }
    if (amount > t.solde) {
      setError(`Le montant ne peut pas dépasser ${formatMontant(t.solde)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi.post<{ id: string }>(`/portal/children/${studentId}/payments`, {
        trancheId: t.trancheId,
        montant: amount,
        telephone,
      });
      setTracked((prev) => ({ ...prev, [t.trancheId]: res.id }));
      setOpenId(null);
    } catch (e) {
      setError(describePortalError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <h2 className="font-display text-base font-semibold text-ink">Payer en ligne</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Payez une tranche par Mobile Money (MTN ou Airtel). Vous validez sur votre téléphone avec votre code secret : l&apos;école ne le voit jamais.
        Vous payez exactement le montant de la tranche, sans frais en plus.
      </p>
      <ul className="mt-3 space-y-3">
        {shown.map((t) => {
          const paymentId = tracked[t.trancheId] ?? t.enAttente?.id ?? null;
          return (
            <li key={t.trancheId} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{t.libelle}</p>
                  <p className="text-sm text-ink-muted">
                    Reste {formatMontant(t.solde)} · avant le {frDate(t.dateLimite)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.enRetard && <Badge color="orange">En retard</Badge>}
                  {!paymentId && openId !== t.trancheId && <Button onClick={() => open(t)}>Payer</Button>}
                </div>
              </div>

              {paymentId && (
                <div className="mt-3">
                  <PaymentTracker
                    studentId={studentId}
                    paymentId={paymentId}
                    onDone={() => {
                      setFinished((prev) => ({ ...prev, [t.trancheId]: t }));
                      onChanged();
                    }}
                  />
                </div>
              )}

              {!paymentId && openId === t.trancheId && (
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(t);
                  }}
                >
                  <Field label="Montant à payer (FCFA)">
                    <Input inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))} required />
                  </Field>
                  <Field label="Numéro Mobile Money à débiter">
                    <Input inputMode="tel" autoComplete="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} required />
                  </Field>
                  <ErrorMessage>{error}</ErrorMessage>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>
                      {busy ? "Envoi…" : `Payer ${montant ? formatMontant(Number(montant)) : ""}`}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setOpenId(null)} disabled={busy}>
                      Annuler
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
