"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle } from "@/components/ui";
import { STATUT_COLOR, STATUT_LABEL, dayLabel, type PreRegistrationStatus } from "@/lib/pre-registrations";

interface Tracking {
  reference: string;
  enfant: string;
  statut: PreRegistrationStatus;
  motifRejet: string | null;
  dateDepot: string;
  dateTraitement: string | null;
}

/** Suivi public d'une demande : la référence seule ne suffit pas (elle est séquentielle, donc devinable), le téléphone
 * du responsable doit correspondre. Aucun compte n'est nécessaire. */
export default function PreRegistrationTrackingPage() {
  const [reference, setReference] = useState("");
  const [telephone, setTelephone] = useState("");
  const [result, setResult] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch(
        `${API_URL}/preinscriptions/suivi?reference=${encodeURIComponent(reference.trim())}&telephone=${encodeURIComponent(telephone.trim())}`,
      );
      if (!res.ok) throw new Error("Aucune demande ne correspond à cette référence et ce téléphone.");
      setResult((await res.json()) as Tracking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <PageTitle subtitle="Retrouvez votre demande avec le numéro de référence reçu au dépôt et le numéro de téléphone du responsable.">
        Suivre ma préinscription
      </PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Numéro de référence">
            <Input required placeholder="PREINS-2026-000123" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Téléphone du responsable">
            <Input type="tel" required value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Recherche…" : "Voir le statut"}
          </Button>
        </form>
      </Card>

      {result && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Référence {result.reference}</p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">{result.enfant}</p>
          <div className="mt-2">
            <Badge color={STATUT_COLOR[result.statut]}>{STATUT_LABEL[result.statut]}</Badge>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Déposée le</dt>
              <dd className="text-ink">{dayLabel(result.dateDepot)}</dd>
            </div>
            {result.dateTraitement && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Traitée le</dt>
                <dd className="text-ink">{dayLabel(result.dateTraitement)}</dd>
              </div>
            )}
          </dl>
          {result.statut === "REJETEE" && result.motifRejet && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{result.motifRejet}</p>
          )}
          {result.statut === "ACCEPTEE" && (
            <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
              Votre demande a été acceptée. L&apos;école vous contactera pour la suite.
            </p>
          )}
        </div>
      )}
      <p className="mt-4 text-center text-sm text-ink-muted">
        <Link href="/preinscription" className="font-medium text-primary underline">
          Déposer une nouvelle demande
        </Link>
      </p>
    </div>
  );
}
