"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Badge, Button, Card, ErrorMessage, Field, Input, Select, SuccessMessage } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { formatMontant } from "@/lib/format";
import {
  allSellable,
  dayLabel,
  isSellable,
  keepSellable,
  monthLabel,
  nextSellable,
  saleTotal,
  shiftMonth,
  toggleDay,
  weekdayName,
  type CanteenDayState,
} from "@/lib/canteen";

interface Purchase {
  ligneId: string;
  libelle: string;
  montant: number;
  annulee: boolean;
  paiement: { id: string; numeroRecu: string; statut: string } | null;
  jours: string[];
}

interface Overview {
  cantine: { actif: boolean; prixJour: number; jours: number[] };
  mois: string;
  anneeDebut: string | null;
  anneeFin: string | null;
  aujourdhui: string;
  venteImpossible: "CANTINE_INACTIVE" | "AUCUNE_ANNEE_ACTIVE" | "AUCUNE_INSCRIPTION" | null;
  jours: CanteenDayState[];
  achats: Purchase[];
}

interface SaleResult {
  paiementId: string;
  numeroRecu: string;
  nombreJours: number;
}

/**
 * Cantine d'un élève (fiche élève, droit CANTEEN_SELL) : on choisit des jours sur le calendrier du mois, l'écran calcule
 * le total, et la vente crée en une seule opération la ligne de facture, les jours payés, le paiement et le reçu. Le
 * serveur refait tous les contrôles (jour de cantine, ouvert, pas déjà payé, total).
 */
export function CanteenCard({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"ESPECES" | "MOBILE_MONEY">("ESPECES");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SaleResult | null>(null);

  const load = useCallback(
    async (m: string | null) => {
      try {
        const res = await api.get<Overview>(`/canteen/students/${studentId}${m ? `?month=${m}` : ""}`);
        setData(res);
        setMonth(res.mois);
        setSelected((prev) => keepSellable(prev, res.jours));
        return res;
      } catch (err) {
        setError(isApiError(err) ? err.message : t("can.card.loadError"));
        return null;
      }
    },
    [studentId, t],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const prix = data?.cantine.prixJour ?? 0;
  const total = saleTotal(selected.length, prix);
  const canSell = data !== null && data.venteImpossible === null;
  const monthOutOfYear = useMemo(() => {
    if (!data || !month) return false;
    return data.jours.length === 0;
  }, [data, month]);

  async function go(delta: number) {
    if (!month) return;
    setError(null);
    setDone(null);
    await load(shiftMonth(month, delta));
  }

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    if (!data || selected.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await api.post<SaleResult>(`/canteen/students/${studentId}/sales`, {
        dates: selected,
        totalAttendu: total,
        modePaiement: mode,
        ...(mode === "MOBILE_MONEY" ? { referenceExterne: reference.trim() } : {}),
      });
      setDone(res);
      setSelected([]);
      setReference("");
      await load(month);
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
      // Un 409 vient souvent d'un prix changé ou d'un jour payé entre-temps : on recharge pour afficher l'état réel.
      await load(month);
    } finally {
      setBusy(false);
    }
  }

  const unavailable =
    data?.venteImpossible === "AUCUNE_INSCRIPTION"
      ? t("can.card.noEnrollment")
      : data?.venteImpossible === "AUCUNE_ANNEE_ACTIVE"
        ? t("can.card.noYear")
        : data?.venteImpossible === "CANTINE_INACTIVE"
          ? t("can.card.inactive")
          : null;

  // Cantine éteinte : la carte n'existe pas pour le secrétariat (rien à vendre, rien à afficher).
  if (data && !data.cantine.actif) return null;

  return (
    <Card className="lg:col-span-3">
      <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold text-ink">
        <UtensilsCrossed size={16} className="text-primary" /> {t("can.card.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("can.card.help")}</p>
      {data && (
        <p className="mt-1 text-xs text-ink-muted">
          {t("can.card.priceLine", {
            prix: formatMontant(prix),
            jours: [...data.cantine.jours]
              .sort((a, b) => a - b)
              .map((d) => weekdayName(d, intl))
              .join(", "),
          })}
        </p>
      )}

      {unavailable && <p className="mt-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink">{unavailable}</p>}

      {canSell && month && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button type="button" variant="secondary" aria-label={t("can.card.prevMonth")} onClick={() => void go(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <p className="text-sm font-semibold capitalize text-ink">{monthLabel(month, intl)}</p>
            <Button type="button" variant="secondary" aria-label={t("can.card.nextMonth")} onClick={() => void go(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>

          {monthOutOfYear ? (
            <p className="text-sm text-ink-muted">{t("can.card.noDays")}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setSelected(allSellable(data.jours))}>
                  {t("can.sel.all")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelected(nextSellable(data.jours, data.jours.length, data.aujourdhui))}
                >
                  {t("can.sel.fromToday")}
                </Button>
                {[3, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="secondary"
                    onClick={() => setSelected(nextSellable(data.jours, n, data.aujourdhui))}
                  >
                    {t("can.sel.next", { n })}
                  </Button>
                ))}
                {selected.length > 0 && (
                  <Button type="button" variant="ghost" onClick={() => setSelected([])}>
                    {t("can.sel.clear")}
                  </Button>
                )}
              </div>

              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label={t("can.card.title")}>
                {data.jours.map((d) => {
                  const sellable = isSellable(d);
                  const isSelected = selected.includes(d.date);
                  const label = dayLabel(d.date, intl);
                  const state = d.paye
                    ? d.ferme
                      ? t("can.day.paidClosed")
                      : t("can.day.paid")
                    : d.ferme
                      ? t("can.day.closed")
                      : isSelected
                        ? t("can.day.selected")
                        : t("can.day.free");
                  const tone = d.paye
                    ? d.ferme
                      ? "border-warning bg-warning-soft text-warning"
                      : "border-success bg-success-soft text-success"
                    : d.ferme
                      ? "border-border bg-surface-muted text-ink-muted line-through"
                      : isSelected
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface text-ink hover:border-primary";
                  return (
                    <li key={d.date}>
                      <button
                        type="button"
                        disabled={!sellable}
                        aria-pressed={sellable ? isSelected : undefined}
                        title={d.motifFermeture ?? undefined}
                        onClick={() => setSelected((s) => toggleDay(s, d.date))}
                        className={`flex w-full flex-col items-start rounded-xl border px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${tone}`}
                      >
                        <span className="font-medium capitalize">{label}</span>
                        <span className="text-xs">{state}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {data.jours.some((d) => d.paye && d.ferme) && (
                <p className="mt-2 text-xs text-ink-muted">{t("can.closedNote")}</p>
              )}
            </>
          )}

          <form onSubmit={(e) => void sell(e)} className="mt-4 rounded-xl bg-surface-muted p-4">
            <p className="text-sm font-semibold text-ink">
              {selected.length === 0
                ? t("can.sel.none")
                : t("can.sel.summary", {
                    n: selected.length,
                    prix: formatMontant(prix),
                    total: formatMontant(total),
                  })}
            </p>
            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="w-48">
                  <Field label={t("can.pay.mode")}>
                    <Select value={mode} onChange={(e) => setMode(e.target.value as "ESPECES" | "MOBILE_MONEY")}>
                      <option value="ESPECES">{t("fin.mode.ESPECES")}</option>
                      <option value="MOBILE_MONEY">{t("fin.mode.MOBILE_MONEY")}</option>
                    </Select>
                  </Field>
                </div>
                {mode === "MOBILE_MONEY" && (
                  <div className="w-64">
                    <Field label={t("can.pay.ref")}>
                      <Input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={t("can.pay.refHint")}
                        required
                      />
                    </Field>
                  </div>
                )}
                <Button type="submit" disabled={busy || (mode === "MOBILE_MONEY" && !reference.trim())}>
                  {busy ? t("can.pay.busy") : t("can.pay.confirm", { total: formatMontant(total) })}
                </Button>
              </div>
            )}
          </form>

          <ErrorMessage>{error}</ErrorMessage>
          {done && (
            <SuccessMessage>
              <span className="inline-flex flex-wrap items-center gap-2">
                {t("can.pay.done", { n: done.nombreJours, numero: done.numeroRecu })}
                <Link href={`/recus/${done.paiementId}`} className="font-semibold underline">
                  {t("can.pay.viewReceipt")}
                </Link>
              </span>
            </SuccessMessage>
          )}
        </div>
      )}
      {!canSell && <ErrorMessage>{error}</ErrorMessage>}

      {data && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">{t("can.hist.title")}</h3>
          {data.achats.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("can.hist.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {data.achats.map((a) => (
                <li
                  key={a.ligneId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5 text-sm"
                >
                  <span className={a.annulee ? "text-ink-muted line-through" : "text-ink"}>{a.libelle}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{formatMontant(a.montant)}</span>
                    {a.annulee ? (
                      <Badge color="red">{t("can.hist.cancelled")}</Badge>
                    ) : (
                      a.paiement && (
                        <Link href={`/recus/${a.paiement.id}`} className="text-xs text-primary underline">
                          {t("can.hist.receipt", { numero: a.paiement.numeroRecu })}
                        </Link>
                      )
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
