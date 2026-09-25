"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useParent } from "@/contexts/parent-context";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { formatDate, formatMontant } from "@/lib/format";
import { amountInWords } from "@/lib/amount-in-words";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { Badge, Button, ErrorMessage, Spinner } from "@/components/ui";
import { SchoolLogo } from "@/components/school-logo";

interface Receipt {
  numeroRecu: string;
  statut: "VALIDE" | "ANNULE";
  montant: number;
  devise: string;
  modePaiement: string;
  referenceExterne: string | null;
  date: string;
  libelle: string;
  eleve: { nom: string; prenom: string; matricule: string };
  classe: string;
  anneeScolaire: string;
  ecole: { nom: string; adresse: string | null; telephone: string | null; logoUrl: string | null };
}

const MODE_KEY: Record<string, MessageKey> = {
  ESPECES: "parent.child.modeCash",
  MOBILE_MONEY: "parent.child.modeMobile",
  VIREMENT: "parent.child.modeTransfer",
  CHEQUE: "parent.child.modeCheque",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Reçu d'un paiement de l'enfant, lisible et imprimable par le parent. */
export default function ParentReceiptPage() {
  const { id, paymentId } = useParams<{ id: string; paymentId: string }>();
  const { parent, loading } = useParent();
  const { t } = useI18n();
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !parent) router.replace("/parents/connexion");
  }, [loading, parent, router]);

  useEffect(() => {
    if (!parent) return;
    portalApi
      .get<Receipt>(`/portal/children/${id}/payments/${paymentId}/receipt`)
      .then((r) => {
        setReceipt(r);
        setError(null);
      })
      .catch((e) => setError(describePortalError(e)));
  }, [parent, id, paymentId]);

  if (loading || !parent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/parents/enfant/${id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={16} /> {t("receipt.back")}
        </Link>
        {receipt && (
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} /> {t("receipt.print")}
          </Button>
        )}
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {!receipt && !error && <Spinner />}
      {receipt && (
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6">
          <div className="text-center">
            {receipt.ecole.logoUrl && (
              <SchoolLogo logoUrl={receipt.ecole.logoUrl} className="mx-auto mb-2 h-14 w-auto max-w-full object-contain" />
            )}
            <p className="font-display text-lg font-semibold text-ink">{receipt.ecole.nom}</p>
            {receipt.ecole.adresse && <p className="text-xs text-ink-muted">{receipt.ecole.adresse}</p>}
            {receipt.ecole.telephone && <p className="text-xs text-ink-muted">{receipt.ecole.telephone}</p>}
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t("receipt.title")}</p>
            <p className="font-mono text-sm text-ink">{receipt.numeroRecu}</p>
            <p className="text-xs text-ink-muted">{formatDate(receipt.date)}</p>
            {receipt.statut === "ANNULE" && (
              <p className="mt-2">
                <Badge color="red">{t("receipt.cancelled")}</Badge>
              </p>
            )}
          </div>

          <dl className="mt-4 space-y-2 border-t border-dashed border-border pt-4 text-sm">
            <Row label={t("receipt.student")} value={`${receipt.eleve.prenom} ${receipt.eleve.nom}`} />
            <Row label={t("receipt.studentId")} value={receipt.eleve.matricule} />
            <Row label={t("receipt.class")} value={`${receipt.classe} (${receipt.anneeScolaire})`} />
            <Row label={t("receipt.reason")} value={receipt.libelle} />
            <Row label={t("receipt.method")} value={MODE_KEY[receipt.modePaiement] ? t(MODE_KEY[receipt.modePaiement]) : receipt.modePaiement} />
            {receipt.referenceExterne && <Row label={t("receipt.reference")} value={receipt.referenceExterne} />}
          </dl>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
            <span className="text-sm font-medium text-ink">{t("receipt.amountPaid")}</span>
            <span className="font-display text-xl font-semibold text-ink">{formatMontant(receipt.montant, receipt.devise === "XAF" ? "FCFA" : receipt.devise)}</span>
          </div>
          <p className="mt-2 text-xs italic text-ink-muted">{t("receipt.inWords", { words: amountInWords(receipt.montant, receipt.devise) })}</p>
          <p className="mt-6 text-center text-[11px] text-ink-muted">{t("receipt.footer")}</p>
        </div>
      )}
    </div>
  );
}
