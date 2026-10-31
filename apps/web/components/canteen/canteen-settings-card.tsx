"use client";

import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Button, Card, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";
import type { School } from "@/lib/types";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { weekdayName } from "@/lib/canteen";

// Lundi d'abord : 1 à 6 puis dimanche (0), comme un calendrier de classe.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Réglages de la cantine (Établissement, droit SETTINGS_MANAGE : Administrateur et Promoteur) : interrupteur, prix, jours. */
export function CanteenSettingsCard({ school, onSaved }: { school: School; onSaved: (s: School) => void }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [active, setActive] = useState(school.cantineActive);
  const [price, setPrice] = useState(String(school.cantinePrixJourFcfa));
  const [days, setDays] = useState<number[]>(school.cantineJours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const parsedPrice = /^\d+$/.test(price.trim()) ? Number(price.trim()) : NaN;
  const valid = Number.isInteger(parsedPrice) && parsedPrice > 0 && days.length > 0;
  const outsideSchool = days.filter((d) => !school.joursClasse.includes(d));
  const dirty =
    active !== school.cantineActive ||
    parsedPrice !== school.cantinePrixJourFcfa ||
    [...days].sort().join() !== [...school.cantineJours].sort().join();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!valid) {
      setError(t("can.set.invalid"));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patch<School>("/school", {
        cantineActive: active,
        cantinePrixJourFcfa: parsedPrice,
        cantineJours: [...days].sort((a, b) => a - b),
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 max-w-xl">
      <div className="flex items-center gap-2.5">
        <UtensilsCrossed size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-ink">{t("can.set.title")}</h2>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t("can.set.help")}</p>
      <form onSubmit={(e) => void save(e)} className="mt-3 space-y-4">
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>
            {t("can.set.active")}
            <span className="block text-xs text-ink-muted">{t("can.set.activeHelp")}</span>
          </span>
        </label>
        <div className="w-48">
          <Field label={t("can.set.price")}>
            <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">{t("can.set.days")}</legend>
          <div className="flex flex-wrap gap-2">
            {WEEK.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize ${
                    on ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:border-primary"
                  }`}
                >
                  {weekdayName(d, intl)}
                </button>
              );
            })}
          </div>
          {outsideSchool.length > 0 && (
            <p className="mt-2 text-xs text-warning">
              {t("can.set.notSchoolDay", { jours: outsideSchool.map((d) => weekdayName(d, intl)).join(", ") })}
            </p>
          )}
        </fieldset>
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? t("can.set.saving") : t("can.set.save")}
        </Button>
      </form>
      <ErrorMessage>{error}</ErrorMessage>
      {saved && <SuccessMessage>{t("can.set.saved")}</SuccessMessage>}
    </Card>
  );
}
