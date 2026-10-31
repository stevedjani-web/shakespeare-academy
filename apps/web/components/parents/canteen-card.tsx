"use client";

import { useEffect, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Badge, Card, ErrorMessage } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { formatMontant } from "@/lib/format";
import { dayLabel } from "@/lib/canteen";

interface ParentCanteen {
  actif: boolean;
  prixJour: number;
  joursPayes: Array<{ date: string; ferme: boolean }>;
  prochain: string | null;
  achats: Array<{ libelle: string; montant: number; nombreJours: number }>;
}

/**
 * Cantine de l'enfant, en lecture seule : jours payés, prochain jour attendu, achats. Rien n'apparaît si l'école n'a pas
 * activé la cantine. Pour payer d'autres jours, le parent passe par le secrétariat.
 */
export function ParentCanteenCard({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [data, setData] = useState<ParentCanteen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    portalApi
      .get<ParentCanteen>(`/portal/children/${studentId}/canteen`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(describePortalError(err) || t("can.parent.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, t]);

  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!data || !data.actif) return null;

  return (
    <Card className="mb-4">
      <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold text-ink">
        <UtensilsCrossed size={16} className="text-primary" /> {t("can.parent.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("can.parent.help", { prix: formatMontant(data.prixJour) })}</p>
      {data.joursPayes.length === 0 ? (
        <p className="mt-3 text-sm text-ink">{t("can.parent.none")}</p>
      ) : (
        <>
          {data.prochain && (
            <p className="mt-3 text-sm font-medium capitalize text-ink">
              {t("can.parent.next", { date: dayLabel(data.prochain, intl) })}
            </p>
          )}
          <h3 className="mb-1.5 mt-3 text-sm font-semibold text-ink">{t("can.parent.paidDays")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {data.joursPayes.map((j) => (
              <li key={j.date}>
                <Badge color={j.ferme ? "orange" : "green"}>
                  <span className="capitalize">{dayLabel(j.date, intl)}</span>
                  {j.ferme && ` · ${t("can.parent.closedNote")}`}
                </Badge>
              </li>
            ))}
          </ul>
          {data.achats.length > 0 && (
            <>
              <h3 className="mb-1.5 mt-3 text-sm font-semibold text-ink">{t("can.parent.purchases")}</h3>
              <ul className="space-y-1 text-sm text-ink-muted">
                {data.achats.map((a, i) => (
                  <li key={i}>{t("can.parent.purchaseLine", { libelle: a.libelle, montant: formatMontant(a.montant) })}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}
