"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Button, Card, ErrorMessage } from "@/components/ui";
import type { DocLocale, IssuedDocumentView } from "@/lib/documents";
import { downloadAttestationPdf } from "@/lib/documents-pdf";

/**
 * Attestation de scolarité de l'enfant, téléchargée par le parent lui-même, en français ou en anglais. Elle porte le
 * même numéro que celle du secrétariat et un QR code qui permet à qui la reçoit d'en vérifier l'authenticité.
 */
export function ParentDocumentsTab({ studentId }: { studentId: string }) {
  const [busy, setBusy] = useState<DocLocale | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(locale: DocLocale) {
    setBusy(locale);
    setError(null);
    try {
      const doc = await portalApi.post<IssuedDocumentView>(`/portal/children/${studentId}/attestation`);
      await downloadAttestationPdf(doc, locale);
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold text-ink">
        <FileText size={16} className="text-primary" /> Attestation de scolarité
      </h2>
      <p className="mb-3 text-sm text-ink-muted">
        Un document officiel de l&apos;école, à présenter à une administration ou à un organisme. Il est valable pour l&apos;année scolaire en cours.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null} onClick={() => void download("fr")}>
          {busy === "fr" ? "Préparation…" : "Télécharger en français"}
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void download("en")}>
          {busy === "en" ? "Preparing…" : "Download in English"}
        </Button>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
    </Card>
  );
}
