"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Badge, Button, Card, ErrorMessage, Field, Input } from "@/components/ui";
import { STATUT_COLOR, type PreRegistrationStatus, type StudentKind } from "@/lib/pre-registrations";
import { formatDocDate } from "@/lib/documents";
import type { MessageKey } from "@/lib/i18n";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useSchoolBrand } from "@/lib/school-brand";

interface TrackedChild {
  enfant: string;
  classeDemandee: string;
  typeEleve: StudentKind;
  statut: PreRegistrationStatus;
  motifRejet: string | null;
  dateTraitement: string | null;
}

interface Tracking {
  reference: string;
  dateDepot: string;
  enfants: TrackedChild[];
}

// Libellés des statuts : table de CLÉS, résolue à l'affichage (jamais un texte figé au chargement du module).
const STATUS_KEY: Record<PreRegistrationStatus, MessageKey> = {
  EN_ATTENTE: "cnt.pre.status.EN_ATTENTE",
  ACCEPTEE: "cnt.pre.status.ACCEPTEE",
  REJETEE: "cnt.pre.status.REJETEE",
};

/**
 * Suivi public d'une demande : la référence seule ne suffit pas (elle est séquentielle, donc devinable), le téléphone
 * du parent ou tuteur doit correspondre. Aucun compte n'est nécessaire. Chaque enfant de la demande a sa propre réponse.
 */
export default function PreRegistrationTrackingPage() {
  const { t, locale } = useI18n();
  const { brand } = useSchoolBrand({ withLogo: false });
  const school = brand?.nom ?? "Shakespeare Academy";
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
      if (!res.ok) throw new Error(t("cnt.pre.notFound"));
      setResult((await res.json()) as Tracking);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-3 flex justify-end">
        <LanguageSwitcher />
      </div>
      <SchoolHeader title={t("cnt.pre.trackTitle")} subtitle={t("cnt.pre.trackSubtitle")} />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("cnt.pre.refLabel")}>
            <Input required placeholder="PREINS-2026-000123" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label={t("cnt.pre.guardianPhone")}>
            <Input type="tel" required value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("cnt.pre.searching") : t("cnt.pre.seeStatus")}
          </Button>
        </form>
      </Card>

      {result && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-wide text-ink-muted">{t("cnt.pre.reference", { ref: result.reference })}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {t("cnt.pre.submittedOn")} {formatDocDate(result.dateDepot, locale)}
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("cnt.pre.trackChildren")}</p>
          <ul className="mt-2 space-y-3">
            {result.enfants.map((c, i) => (
              <li key={`${c.enfant}-${i}`} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-display text-base font-semibold text-ink">{c.enfant}</p>
                  <Badge color={STATUT_COLOR[c.statut]}>{t(STATUS_KEY[c.statut])}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{t("cnt.pre.trackRequested", { level: c.classeDemandee })}</p>
                <p className="mt-1.5">
                  <Badge color={c.typeEleve === "ANCIEN" ? "blue" : "green"}>{c.typeEleve === "ANCIEN" ? t("cnt.pre.kindOld", { school }) : t("cnt.pre.kindNew")}</Badge>
                </p>
                {c.dateTraitement && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {t("cnt.pre.processedOn")} {formatDocDate(c.dateTraitement, locale)}
                  </p>
                )}
                {c.statut === "REJETEE" && c.motifRejet && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{c.motifRejet}</p>}
                {c.statut === "ACCEPTEE" && <p className="mt-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{t("cnt.pre.acceptedMsg")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-center text-sm text-ink-muted">
        <Link href="/preinscription" className="font-medium text-primary underline">
          {t("cnt.pre.newRequest")}
        </Link>
      </p>
      <div className="mt-6">
        <CopyrightFooter />
      </div>
    </div>
  );
}
