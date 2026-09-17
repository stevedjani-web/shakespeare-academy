"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatDate, formatMontant } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ArrowLeft, Printer } from "lucide-react";

const MODE_LABEL: Record<string, string> = { ESPECES: "Espèces", MOBILE_MONEY: "Mobile Money" };

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [params.id, user]);

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

      <div className="mx-auto w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-0 print:shadow-none">
        {payment.statut === "ANNULE" && (
          <div className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger">
            REÇU ANNULÉ
            {payment.motifAnnulation && <p className="mt-1 text-xs font-normal">{payment.motifAnnulation}</p>}
          </div>
        )}

        <div className="mb-4 text-center">
          <p className="font-display text-lg font-semibold text-ink">Shakespeare Academy</p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Reçu de paiement</p>
          <p className="font-mono text-sm text-ink">{payment.numeroRecu}</p>
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
