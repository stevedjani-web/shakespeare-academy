"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { type MessageKey } from "@/lib/i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";
import { getEntry, useOutbox, type OutboxEntry } from "@/lib/outbox";
import type { School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ReceiptSheet } from "@/components/receipt/receipt-sheet";
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

      {/* Reçu établi sans Internet : jamais de cachet ni de signature automatiques, le caissier les pose à la main. */}
      <ReceiptSheet
        provisional
        school={school}
        numero={r.numero}
        dateLabel={dateLabel}
        student={{ nom: r.eleve, matricule: r.matricule, classe: r.classe }}
        reason={r.motif}
        method={MODE_KEY[r.modePaiement] ? t(MODE_KEY[r.modePaiement]) : r.modePaiement}
        reference={r.referenceExterne}
        cashier={r.caissier}
        montant={r.montant}
        footer={t("fin.prov.footer")}
      />
    </div>
  );
}
