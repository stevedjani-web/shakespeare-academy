"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { formatDocDate } from "@/lib/documents";
import { Spinner } from "@/components/ui";
import { BadgeCheck, ShieldAlert } from "lucide-react";

interface VerifiedDocument {
  type: "ATTESTATION_SCOLARITE" | "CARTE_ELEVE";
  numero: string;
  statut: "VALIDE" | "ANNULE";
  dateEmission: string;
  eleve: { nom: string; prenom: string };
  classe: string;
  annee: string;
  etablissement: string;
}

const TYPE_LABEL = {
  ATTESTATION_SCOLARITE: "Attestation de scolarité / Certificate of enrollment",
  CARTE_ELEVE: "Carte d'élève / Student ID card",
} as const;

// Page publique (aucun compte requis) : ouverte en scannant le QR code d'une attestation ou d'une carte, pour confirmer
// qu'elle correspond à un document réellement émis par l'école. Elle n'affiche que ce qui est imprimé sur le papier :
// à comparer avec le document en main.
export default function VerifyDocumentPage() {
  const params = useParams<{ token: string }>();
  const [doc, setDoc] = useState<VerifiedDocument | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/documents/verify/${params.token}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json() as Promise<VerifiedDocument>;
      })
      .then(setDoc)
      .catch(() => setNotFound(true));
  }, [params.token]);

  if (!doc && !notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert size={40} className="text-danger" />
        <p className="font-display text-lg font-semibold text-ink">Document introuvable / Document not found</p>
        <p className="max-w-xs text-sm text-ink-muted">
          Ce lien ne correspond à aucun document connu. Ne considérez pas ce document comme authentique.
          <span className="mt-1 block italic">This link matches no known document. Do not consider it authentic.</span>
        </p>
      </div>
    );
  }

  const annule = doc.statut === "ANNULE";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${annule ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
        {annule ? <ShieldAlert size={18} /> : <BadgeCheck size={18} />}
        {annule ? "Document annulé / Cancelled" : "Document authentique / Authentic"}
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)]">
        <p className="text-center text-xs uppercase tracking-wide text-ink-muted">{doc.etablissement}</p>
        <p className="mt-1 text-center text-sm font-medium text-ink">{TYPE_LABEL[doc.type]}</p>
        <p className="mt-1 text-center font-mono text-sm text-ink">{doc.numero}</p>

        <dl className="mt-4 space-y-2 border-t border-dashed border-border pt-4 text-sm">
          <Row label="Élève / Student" value={`${doc.eleve.prenom} ${doc.eleve.nom}`} />
          <Row label="Classe / Class" value={doc.classe} />
          <Row label="Année / Year" value={doc.annee} />
          <Row label="Émis le / Issued" value={formatDocDate(doc.dateEmission, "fr")} />
        </dl>

        {annule && (
          <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
            Ce document a été annulé par l&apos;école : il n&apos;est plus valable. / This document was cancelled by the school and is no longer valid.
          </p>
        )}
        <p className="mt-4 text-xs text-ink-muted">
          Comparez ces informations avec le document en main. Elles proviennent directement du serveur de l&apos;établissement.
          <span className="mt-1 block italic">Compare this information with the document you hold. It comes directly from the school&apos;s server.</span>
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
