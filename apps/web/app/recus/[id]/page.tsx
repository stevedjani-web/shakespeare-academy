"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import { montantEnLettres } from "@/lib/number-to-words-fr";
import type { Payment, School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ArrowLeft, Printer } from "lucide-react";

const MODE_LABEL: Record<string, string> = { ESPECES: "Espèces", MOBILE_MONEY: "Mobile Money" };

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      .catch(() => setError("Reçu introuvable."));
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

  if (error) {
    return <p className="p-8 text-center text-danger">{error}</p>;
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
            <ArrowLeft size={14} /> Retour au dossier
          </Link>
        ) : (
          <span />
        )}
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimer
        </Button>
      </div>

      <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-0 print:shadow-none">
        {payment.statut === "ANNULE" && (
          <div className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger">
            REÇU ANNULÉ
            {payment.motifAnnulation && <p className="mt-1 text-xs font-normal">{payment.motifAnnulation}</p>}
          </div>
        )}

        <div className="mb-4 flex flex-col items-center text-center">
          {school?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo externe servi par l'API, hors du domaine web (next/image l'exigerait en config supplémentaire)
            <img src={`${API_URL}${school.logoUrl}`} alt="" className="mb-2 h-16 w-auto object-contain" />
          )}
          <p className="font-display text-lg font-semibold text-ink">{school?.nom ?? "Shakespeare Academy"}</p>
          {school?.adresse && <p className="text-xs text-ink-muted">{school.adresse}</p>}
          {school?.telephone && <p className="text-xs text-ink-muted">{school.telephone}</p>}
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Reçu de paiement</p>
          <p className="font-mono text-sm text-ink">{payment.numeroRecu}</p>
          {payment.numeroProvisoire && (
            <p className="text-[11px] text-ink-muted">Remplace le reçu provisoire {payment.numeroProvisoire}</p>
          )}
          <p className="text-xs text-ink-muted">{formatDate(payment.datePaiement)}</p>
        </div>

        <dl className="space-y-2 border-t border-dashed border-border pt-4 text-sm">
          {enrollment && (
            <>
              <Row label="Élève" value={`${enrollment.student.prenom} ${enrollment.student.nom}`} />
              <Row label="Matricule" value={enrollment.student.matricule} />
              <Row label="Classe" value={`${enrollment.class.nom} (${enrollment.academicYear.libelle})`} />
            </>
          )}
          <Row label="Motif" value={payment.invoiceLine?.libelle ?? "—"} />
          <Row label="Mode de paiement" value={MODE_LABEL[payment.modePaiement] ?? payment.modePaiement} />
          {payment.referenceExterne && <Row label="Référence" value={payment.referenceExterne} />}
          <Row label="Reçu par" value={`${payment.recuParUser.prenom} ${payment.recuParUser.nom}`} />
        </dl>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
          <span className="text-sm font-medium text-ink">Montant payé</span>
          <span className="font-display text-xl font-semibold text-ink">{formatMontant(payment.montant)}</span>
        </div>
        <p className="mt-2 text-xs italic text-ink-muted">
          Arrêté le présent reçu à la somme de : {montantEnLettres(payment.montant, school?.devise === "XAF" ? "francs CFA" : school?.devise)}.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 text-center text-xs text-ink-muted">
          <div>
            <div className="h-16 border-b border-dashed border-border" />
            <p className="mt-1">Signature du caissier</p>
          </div>
          <div>
            <div className="h-16 border-b border-dashed border-border" />
            <p className="mt-1">Cachet de la Direction</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-1 border-t border-dashed border-border pt-4">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client, jamais une image next/image
            <img src={qrDataUrl} alt="QR code de vérification du reçu" className="h-20 w-20" />
          )}
          <p className="text-center text-[10px] text-ink-muted">
            Scanner pour vérifier l&apos;authenticité de ce reçu.
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-ink-muted">
          Document généré électroniquement — valable comme preuve de paiement.
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
