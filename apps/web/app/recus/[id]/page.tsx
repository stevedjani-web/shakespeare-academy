"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import { amountInWords } from "@/lib/amount-in-words";
import { type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Payment, School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { SchoolLogo } from "@/components/school-logo";
import { ArrowLeft, Printer } from "lucide-react";

const MODE_KEY: Record<string, MessageKey> = { ESPECES: "fin.mode.ESPECES", MOBILE_MONEY: "fin.mode.MOBILE_MONEY" };

export default function ReceiptPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const details = useExpanded();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api
      .get<Payment>(`/payments/${params.id}`)
      .then(setPayment)
      .catch(() => setNotFound(true));
    api.get<School>("/school").then(setSchool).catch(() => {});
  }, [params.id, user]);

  useEffect(() => {
    if (!payment) return;
    const url = `${window.location.origin}/verifier-recu/${payment.verificationToken}`;
    QRCode.toDataURL(url, { width: 120, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [payment]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (notFound) {
    return <p className="p-8 text-center text-danger">{t("fin.receipt.notFound")}</p>;
  }

  if (!payment) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  const enrollment = payment.invoiceLine?.invoice.enrollment;

  return (
    <div className="mx-auto max-w-md px-4 py-8 print:max-w-full print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        {enrollment ? (
          <Link
            href={`/eleves/${enrollment.student.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline"
          >
            <ArrowLeft size={14} /> {t("fin.receipt.backToFile")}
          </Link>
        ) : (
          <span />
        )}
        <Button onClick={() => window.print()}>
          <Printer size={16} /> {t("receipt.print")}
        </Button>
      </div>

      <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-0 print:shadow-none">
        {payment.statut === "ANNULE" && (
          <div className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger">
            {t("fin.receipt.cancelledBanner")}
            {payment.motifAnnulation && <p className="mt-1 text-xs font-normal">{payment.motifAnnulation}</p>}
          </div>
        )}

        <div className="mb-4 flex flex-col items-center text-center">
          {school?.logoUrl && <SchoolLogo logoUrl={school.logoUrl} className="mb-2 h-14 w-auto max-w-full object-contain" />}
          <p className="font-display text-lg font-semibold text-ink">{school?.nom ?? "Shakespeare Academy"}</p>
          {school?.adresse && <p className="text-xs text-ink-muted">{school.adresse}</p>}
          {school?.telephone && <p className="text-xs text-ink-muted">{school.telephone}</p>}
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t("receipt.title")}</p>
          <p className="font-mono text-sm text-ink">{payment.numeroRecu}</p>
          {payment.numeroProvisoire && (
            <p className="text-[11px] text-ink-muted">{t("fin.receipt.replaces", { number: payment.numeroProvisoire })}</p>
          )}
          <p className="text-xs text-ink-muted">{formatDate(payment.datePaiement)}</p>
        </div>

        {/* Le + ne concerne que l'écran : à l'impression, le détail est toujours imprimé. */}
        <div className="flex items-center gap-2.5 border-t border-dashed border-border pt-4 print:hidden">
          <ExpandButton open={details.isOpen("details")} onClick={() => details.toggle("details")} label={t("fin.receipt.expandLabel")} />
          <span className="text-sm font-medium text-ink">{t("fin.receipt.details")}</span>
        </div>
        <dl className={`space-y-2 pt-3 text-sm print:block print:border-t print:border-dashed print:border-border print:pt-4 ${details.isOpen("details") ? "" : "hidden"}`}>
          {enrollment && (
            <>
              <Row label={t("receipt.student")} value={`${enrollment.student.prenom} ${enrollment.student.nom}`} />
              <Row label={t("receipt.studentId")} value={enrollment.student.matricule} />
              <Row label={t("receipt.class")} value={`${enrollment.class.nom} (${enrollment.academicYear.libelle})`} />
            </>
          )}
          <Row label={t("receipt.reason")} value={payment.invoiceLine?.libelle ?? "—"} />
          <Row label={t("receipt.method")} value={MODE_KEY[payment.modePaiement] ? t(MODE_KEY[payment.modePaiement]) : payment.modePaiement} />
          {payment.referenceExterne && <Row label={t("receipt.reference")} value={payment.referenceExterne} />}
          <Row label={t("fin.receipt.receivedBy")} value={payment.recuParUser ? `${payment.recuParUser.prenom} ${payment.recuParUser.nom}` : t("fin.receipt.online")} />
        </dl>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
          <span className="text-sm font-medium text-ink">{t("receipt.amountPaid")}</span>
          <span className="font-display text-xl font-semibold text-ink">{formatMontant(payment.montant)}</span>
        </div>
        <p className="mt-2 text-xs italic text-ink-muted">
          {t("receipt.inWords", { words: amountInWords(payment.montant, school?.devise) })}
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

        <div className="mt-6 flex flex-col items-center gap-1 border-t border-dashed border-border pt-4">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client, jamais une image next/image
            <img src={qrDataUrl} alt={t("fin.receipt.qrAlt")} className="h-20 w-20" />
          )}
          <p className="text-center text-[10px] text-ink-muted">
            {t("fin.receipt.scanHint")}
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-ink-muted">
          {t("fin.receipt.footer")}
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
