"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/lib/format";
import { type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Payment, School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ReceiptSheet } from "@/components/receipt/receipt-sheet";
import { useAuthImage } from "@/lib/use-auth-image";
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
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [payment]);

  const cachetSrc = useAuthImage(user ? "/receipt-assets/cachet" : null);
  const signatureSrc = useAuthImage(payment && payment.statut !== "ANNULE" ? `/receipt-assets/signature/payment/${payment.id}` : null);

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

      <ReceiptSheet
        school={school}
        numero={payment.numeroRecu}
        replacesNumber={payment.numeroProvisoire}
        dateLabel={formatDate(payment.datePaiement)}
        cancelled={payment.statut === "ANNULE" ? { motif: payment.motifAnnulation ?? null } : null}
        student={
          enrollment
            ? {
                nom: `${enrollment.student.prenom} ${enrollment.student.nom}`,
                matricule: enrollment.student.matricule,
                classe: `${enrollment.class.nom} (${enrollment.academicYear.libelle})`,
              }
            : null
        }
        reason={payment.invoiceLine?.libelle ?? "—"}
        method={MODE_KEY[payment.modePaiement] ? t(MODE_KEY[payment.modePaiement]) : payment.modePaiement}
        reference={payment.referenceExterne}
        cashier={payment.recuParUser ? `${payment.recuParUser.prenom} ${payment.recuParUser.nom}` : t("fin.receipt.online")}
        montant={payment.montant}
        // Le cachet de l'établissement, et la signature du caissier qui a encaissé (jamais celle de la personne qui imprime).
        cachetSrc={cachetSrc}
        signatureSrc={signatureSrc}
        verifyQr={qrDataUrl}
        footer={t("fin.receipt.footer")}
      />
    </div>
  );
}
