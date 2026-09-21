"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatMontant } from "@/lib/format";
import { montantEnLettres } from "@/lib/number-to-words-fr";
import { getEntry, useOutbox, type OutboxEntry } from "@/lib/outbox";
import type { School } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { ArrowLeft, Printer } from "lucide-react";

const MODE_LABEL: Record<string, string> = { ESPECES: "Espèces", MOBILE_MONEY: "Mobile Money" };

// Reçu PROVISOIRE d'un encaissement saisi sans Internet (D49). Il porte un numéro PROV-xxxx propre à
// l'appareil et la mention bien visible qu'il n'est pas le reçu officiel : le numéro officiel
// (REC-xxxxxx) n'existe qu'une fois la saisie acceptée par le serveur. Volontairement sans code de
// vérification (il ne peut pas être contrôlé en ligne).
export default function ProvisionalReceiptPage() {
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
    return <p className="p-8 text-center text-danger">Reçu provisoire introuvable sur cet appareil.</p>;
  }

  const r = entry.receipt;
  const synced = entry.status === "done" && entry.resultId;
  const dateLabel = new Date(r.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-md px-4 py-8 print:max-w-full print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={entry.studentId ? `/eleves/${entry.studentId}` : "/hors-ligne"}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline"
        >
          <ArrowLeft size={14} /> Retour
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimer
        </Button>
      </div>

      {synced ? (
        <Link
          href={`/recus/${entry.resultId}`}
          className="mb-4 block rounded-xl bg-success-soft px-3 py-2 text-center text-sm font-medium text-success print:hidden"
        >
          Synchronisé : le reçu officiel {entry.resultNumero ?? ""} est disponible. Touchez ici pour l&apos;ouvrir.
        </Link>
      ) : entry.status === "failed" ? (
        <p className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger print:hidden">
          Cet encaissement a été refusé à l&apos;envoi : {entry.error} Voir « Synchronisation ».
        </p>
      ) : (
        <p className="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-center text-sm text-warning print:hidden">
          En attente d&apos;envoi au serveur. Le reçu officiel sera disponible après la synchronisation.
        </p>
      )}

      <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-3 rounded-xl border-2 border-dashed border-warning px-3 py-2 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-warning">Reçu provisoire</p>
          <p className="text-[11px] text-ink-muted">Ne remplace pas le reçu officiel. À échanger contre celui-ci.</p>
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
          <ExpandButton open={details.isOpen("details")} onClick={() => details.toggle("details")} label="le détail du paiement" />
          <span className="text-sm font-medium text-ink">Détail du paiement</span>
        </div>
        <dl className={`space-y-2 pt-3 text-sm print:block print:border-t print:border-dashed print:border-border print:pt-4 ${details.isOpen("details") ? "" : "hidden"}`}>
          <Row label="Élève" value={r.eleve} />
          <Row label="Matricule" value={r.matricule} />
          <Row label="Classe" value={r.classe} />
          <Row label="Motif" value={r.motif} />
          <Row label="Mode de paiement" value={MODE_LABEL[r.modePaiement] ?? r.modePaiement} />
          {r.referenceExterne && <Row label="Référence" value={r.referenceExterne} />}
          <Row label="Reçu par" value={r.caissier} />
        </dl>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
          <span className="text-sm font-medium text-ink">Montant payé</span>
          <span className="font-display text-xl font-semibold text-ink">{formatMontant(r.montant)}</span>
        </div>
        <p className="mt-2 text-xs italic text-ink-muted">
          Arrêté le présent reçu à la somme de : {montantEnLettres(r.montant, school?.devise === "XAF" ? "francs CFA" : school?.devise)}.
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

        <p className="mt-6 text-center text-[11px] text-ink-muted">
          Reçu provisoire établi sans connexion Internet : il ne devient valable qu&apos;une fois confirmé par le reçu officiel.
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
