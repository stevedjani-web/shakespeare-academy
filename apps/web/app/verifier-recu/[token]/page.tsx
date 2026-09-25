"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";
import { ExpandButton, useExpanded } from "@/components/expand";
import { BadgeCheck, ShieldAlert } from "lucide-react";

interface VerifiedReceipt {
  numeroRecu: string;
  montant: number;
  statut: "VALIDE" | "ANNULE";
  datePaiement: string;
  motif: string;
  eleve: { nom: string; prenom: string };
  etablissement: string | null;
}

// Page publique (aucun compte requis) : destinée à être ouverte en scannant le QR code d'un reçu
// papier, pour confirmer qu'il correspond bien à un enregistrement réel du serveur — jamais via le
// client `api` habituel (qui suppose une session applicative), un simple fetch direct suffit.
export default function VerifyReceiptPage() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<VerifiedReceipt | null>(null);
  const [notFound, setNotFound] = useState(false);
  const details = useExpanded();

  useEffect(() => {
    fetch(`${API_URL}/payments/verify/${params.token}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json() as Promise<VerifiedReceipt>;
      })
      .then(setReceipt)
      .catch(() => setNotFound(true));
  }, [params.token]);

  if (!receipt && !notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <ShieldAlert size={40} className="text-danger" />
        <p className="font-display text-lg font-semibold text-ink">{t("cnt.vr.notFoundTitle")}</p>
        <p className="max-w-xs text-sm text-ink-muted">
          {t("cnt.vr.notFoundText")}
        </p>
      </div>
    );
  }

  if (!receipt) return null;

  const annule = receipt.statut === "ANNULE";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${annule ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
        <BadgeCheck size={18} />
        {annule ? t("cnt.vr.cancelled") : t("cnt.vr.authentic")}
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)]">
        <p className="text-center text-xs uppercase tracking-wide text-ink-muted">{receipt.etablissement ?? t("cnt.vr.school")}</p>
        <p className="mt-1 text-center font-mono text-sm text-ink">{receipt.numeroRecu}</p>

        <dl className="mt-4 space-y-2 border-t border-dashed border-border pt-4 text-sm">
          <Row label={t("cnt.vr.amount")} value={formatMontant(receipt.montant)} />
        </dl>

        <div className="mt-4 flex items-center gap-2.5 border-t border-dashed border-border pt-4">
          <ExpandButton open={details.isOpen("details")} onClick={() => details.toggle("details")} label={t("cnt.vr.detailsLabel")} />
          <span className="text-sm font-medium text-ink">{t("cnt.vr.detailsTitle")}</span>
        </div>
        {details.isOpen("details") && (
          <div className="mt-3 space-y-3">
            <dl className="space-y-2 text-sm">
              <Row label={t("cnt.vr.student")} value={`${receipt.eleve.prenom} ${receipt.eleve.nom}`} />
              <Row label={t("cnt.vr.reason")} value={receipt.motif} />
              <Row label={t("cnt.vr.date")} value={formatDate(receipt.datePaiement)} />
            </dl>
            <p className="text-xs text-ink-muted">
              {t("cnt.vr.info")}
            </p>
          </div>
        )}
      </div>
      <CopyrightFooter />
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
