"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { Button, Card, ErrorMessage } from "@/components/ui";
import type { DocLocale, IssuedDocumentView } from "@/lib/documents";
import { downloadAttestationPdf } from "@/lib/documents-pdf";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Attestation de scolarité de l'enfant, téléchargée par le parent lui-même, en français ou en anglais (la langue du
 * document est un choix à part de celle de l'interface). Elle porte le même numéro que celle du secrétariat et un QR code
 * qui permet à qui la reçoit d'en vérifier l'authenticité.
 */
export function ParentDocumentsTab({ studentId }: { studentId: string }) {
  const { t } = useI18n();
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
        <FileText size={16} className="text-primary" /> {t("parent.docs.title")}
      </h2>
      <p className="mb-3 text-sm text-ink-muted">{t("parent.docs.help")}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null} onClick={() => void download("fr")}>
          {busy === "fr" ? t("parent.docs.preparing") : t("parent.docs.downloadFr")}
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void download("en")}>
          {busy === "en" ? t("parent.docs.preparing") : t("parent.docs.downloadEn")}
        </Button>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
    </Card>
  );
}
