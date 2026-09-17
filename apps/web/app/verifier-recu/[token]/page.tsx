"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { formatDate, formatMontant } from "@/lib/format";
import { Spinner } from "@/components/ui";
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
  const params = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<VerifiedReceipt | null>(null);
  const [notFound, setNotFound] = useState(false);

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
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert size={40} className="text-danger" />
        <p className="font-display text-lg font-semibold text-ink">Reçu introuvable</p>
        <p className="max-w-xs text-sm text-ink-muted">
          Ce lien ne correspond à aucun reçu connu. Ne considérez pas ce document comme authentique.
        </p>
      </div>
    );
  }

  if (!receipt) return null;

  const annule = receipt.statut === "ANNULE";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${annule ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
        <BadgeCheck size={18} />
        {annule ? "Reçu annulé" : "Reçu authentique"}
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)]">
        <p className="text-center text-xs uppercase tracking-wide text-ink-muted">{receipt.etablissement ?? "Établissement"}</p>
        <p className="mt-1 text-center font-mono text-sm text-ink">{receipt.numeroRecu}</p>

        <dl className="mt-4 space-y-2 border-t border-dashed border-border pt-4 text-sm">
          <Row label="Élève" value={`${receipt.eleve.prenom} ${receipt.eleve.nom}`} />
          <Row label="Motif" value={receipt.motif} />
          <Row label="Date" value={formatDate(receipt.datePaiement)} />
          <Row label="Montant" value={formatMontant(receipt.montant)} />
        </dl>
      </div>

      <p className="max-w-xs text-center text-xs text-ink-muted">
        Ces informations proviennent directement du serveur de l&apos;établissement — elles confirment que ce reçu correspond à un paiement réellement enregistré.
      </p>
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
