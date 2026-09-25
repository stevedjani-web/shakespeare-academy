"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatMontant } from "@/lib/format";
import { amountInWords } from "@/lib/amount-in-words";
import { type MessageKey } from "@/lib/i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";
import { getEntry, useOutbox, type OutboxEntry } from "@/lib/outbox";
import type { School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { ArrowLeft, Printer } from "lucide-react";

const MODE_KEY: Record<string, MessageKey> = { ESPECES: "fin.mode.ESPECES", MOBILE_MONEY: "fin.mode.MOBILE_MONEY" };

// Reçu PROVISOIRE d'un encaissement saisi sans Internet (D49). Il porte un numéro PROV-xxxx propre à
// l'appareil et la mention bien visible qu'il n'est pas le reçu officiel : le numéro officiel
// (REC-xxxxxx) n'existe qu'une fois la saisie acceptée par le serveur. Volontairement sans code de
// vérification (il ne peut pas être contrôlé en ligne).
export default function ProvisionalReceiptPage() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { entries } = useOutbox();
  const [entry, setEntry] = useState<OutboxEntry | null | undefined>(undefined);
  const [school, setSchool] = useState<School | null>(null);
  const details = useExpanded();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    void getEntry(params.id).then((e) => setEntry(e ?? null));
  }, [params.id, entries]);

  useEffect(() => {
    if (!user) return;
    api.get<School>("/school").then(setSchool).catch(() => {});
  }, [user]);

  if (loading || !user || entry === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }
  if (!entry || !entry.receipt) {
    return <p className="p-8 text-center text-danger">{t("fin.prov.notFound")}</p>;
  }

  const r = entry.receipt;
  const synced = entry.status === "done" && entry.resultId;
  const dateLabel = new Date(r.date).toLocaleString(INTL_LOCALE[locale], { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-md px-4 py-8 print:max-w-full print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={entry.studentId ? `/eleves/${entry.studentId}` : "/hors-ligne"}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline"
        >
          <ArrowLeft size={14} /> {t("receipt.back")}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> {t("receipt.print")}
        </Button>
      </div>

      {synced ? (
        <Link
          href={`/recus/${entry.resultId}`}
          className="mb-4 block rounded-xl bg-success-soft px-3 py-2 text-center text-sm font-medium text-success print:hidden"
        >
          {t("fin.prov.synced", { number: entry.resultNumero ?? "" })}
        </Link>
      ) : entry.status === "failed" ? (
        <p className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger print:hidden">
          {t("fin.prov.failed", { error: entry.error ?? "" })}
        </p>
      ) : (
        <p className="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-center text-sm text-warning print:hidden">
          {t("fin.prov.pending")}
        </p>
      )}

      <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-3 rounded-xl border-2 border-dashed border-warning px-3 py-2 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-warning">{t("fin.prov.banner")}</p>
          <p className="text-[11px] text-ink-muted">{t("fin.prov.notOfficial")}</p>
        </div>

        <div className="mb-4 flex flex-col items-center text-center">
          {school?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API, hors du domaine web
            <img src={`${API_URL}${school.logoUrl}`} alt="" className="mb-2 h-16 w-auto object-contain" />
          )}
          <p className="font-display text-lg font-semibold text-ink">{school?.nom ?? "Shakespeare Academy"}</p>
          {school?.adresse && <p className="text-xs text-ink-muted">{school.adresse}</p>}
          {school?.telephone && <p className="text-xs text-ink-muted">{school.telephone}</p>}
          <p className="mt-2 font-mono text-sm text-ink">{r.numero}</p>
          <p className="text-xs text-ink-muted">{dateLabel}</p>
        </div>

        {/* Le + ne concerne que l'écran : à l'impression, le détail est toujours imprimé. */}
        <div className="flex items-center gap-2.5 border-t border-dashed border-border pt-4 print:hidden">
          <ExpandButton open={details.isOpen("details")} onClick={() => details.toggle("details")} label={t("fin.receipt.expandLabel")} />
          <span className="text-sm font-medium text-ink">{t("fin.receipt.details")}</span>
        </div>
        <dl className={`space-y-2 pt-3 text-sm print:block print:border-t print:border-dashed print:border-border print:pt-4 ${details.isOpen("details") ? "" : "hidden"}`}>
          <Row label={t("receipt.student")} value={r.eleve} />
          <Row label={t("receipt.studentId")} value={r.matricule} />
          <Row label={t("receipt.class")} value={r.classe} />
          <Row label={t("receipt.reason")} value={r.motif} />
          <Row label={t("receipt.method")} value={MODE_KEY[r.modePaiement] ? t(MODE_KEY[r.modePaiement]) : r.modePaiement} />
          {r.referenceExterne && <Row label={t("receipt.reference")} value={r.referenceExterne} />}
          <Row label={t("fin.receipt.receivedBy")} value={r.caissier} />
        </dl>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
          <span className="text-sm font-medium text-ink">{t("receipt.amountPaid")}</span>
          <span className="font-display text-xl font-semibold text-ink">{formatMontant(r.montant)}</span>
        </div>
        <p className="mt-2 text-xs italic text-ink-muted">
          {t("receipt.inWords", { words: amountInWords(r.montant, school?.devise) })}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 text-center text-xs text-ink-muted">
          <div>
            <div className="h-16 border-b border-dashed border-border" />
            <p className="mt-1">{t("fin.receipt.cashierSignature")}</p>
          </div>
          <div>
            <div className="h-16 border-b border-dashed border-border" />
            <p className="mt-1">{t("fin.receipt.managementStamp")}</p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-ink-muted">
          {t("fin.prov.footer")}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
