"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, UtensilsCrossed, Users } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Badge, Button, Card, EmptyState, ErrorMessage, Input, PageTitle, Spinner, StatCard } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportSection } from "@/lib/export";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { addDaysIso, dayLabel } from "@/lib/canteen";

interface Daily {
  date: string;
  actif: boolean;
  estJourCantine: boolean;
  ferme: string | null;
  total: number;
  classes: Array<{
    classeId: string;
    classe: string;
    section: string;
    eleves: Array<{ id: string; nom: string; prenom: string; matricule: string }>;
  }>;
}

/** Aujourd'hui "AAAA-MM-JJ" selon l'horloge de l'appareil (le serveur, lui, répond avec le jour de l'école si on n'envoie rien). */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CanteenPage() {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [date, setDate] = useState<string>(todayLocal);
  const [data, setData] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<Daily>(`/canteen/daily?date=${date}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(isApiError(err) ? err.message : t("can.page.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, t]);

  const exportSections = useMemo<ExportSection[]>(() => {
    if (!data) return [];
    return [
      {
        title: dayLabel(data.date, intl).slice(0, 28),
        headers: [t("can.page.class"), t("can.page.matricule"), t("can.page.lastName"), t("can.page.firstName")],
        rows: data.classes.flatMap((c) => c.eleves.map((e) => [c.classe, e.matricule, e.nom, e.prenom])),
      },
    ];
  }, [data, intl, t]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow={t("can.page.eyebrow")} subtitle={t("can.page.subtitle")} helpId="cantine">
          {t("can.page.title")}
        </PageTitle>
        <ExportButtons
          fileName={t("can.page.exportFile", { date })}
          title={t("can.page.exportTitle", { date })}
          sections={exportSections}
          disabled={!data || data.total === 0}
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-label={t("can.page.prevDay")}
            onClick={() => setDate((d) => addDaysIso(d, -1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <div className="w-44">
            <Input
              type="date"
              aria-label={t("can.page.date")}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-label={t("can.page.nextDay")}
            onClick={() => setDate((d) => addDaysIso(d, 1))}
          >
            <ChevronRight size={16} />
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDate(todayLocal())}>
            {t("can.page.today")}
          </Button>
          <span className="ml-auto text-sm font-medium capitalize text-ink">{dayLabel(date, intl)}</span>
        </div>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {loading && !data && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {data && (
        <>
          {!data.actif && (
            <p className="mb-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">{t("can.page.inactive")}</p>
          )}
          {data.actif && !data.estJourCantine && (
            <p className="mb-4 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink">{t("can.page.notCanteenDay")}</p>
          )}
          {data.ferme && (
            <p className="mb-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
              {t("can.page.closed", { motif: data.ferme })}
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <StatCard label={t("can.page.statExpected")} value={data.total} tone="success" icon={<Users size={18} />} />
            <StatCard label={t("can.page.statClasses")} value={data.classes.length} tone="info" icon={<UtensilsCrossed size={18} />} />
          </div>

          {data.total === 0 ? (
            <EmptyState icon={<UtensilsCrossed size={28} />} title={t("can.page.none")} />
          ) : (
            <div className="space-y-4">
              {data.classes.map((c) => (
                <Card key={c.classeId}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-ink">
                      {t("can.page.classCount", { classe: c.classe, n: c.eleves.length })}
                    </h2>
                    {c.section && <Badge color="blue">{c.section}</Badge>}
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {c.eleves.map((e) => (
                      <li key={e.id} className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
                        <span className="font-medium">{e.nom}</span> {e.prenom}
                        <span className="ml-2 text-xs text-ink-muted">{e.matricule}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
