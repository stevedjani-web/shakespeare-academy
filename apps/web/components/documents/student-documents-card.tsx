"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, IdCard, RefreshCw } from "lucide-react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { Badge, Button, Card, ErrorMessage, SuccessMessage } from "@/components/ui";
import { ExpandButton } from "@/components/expand";
import { formatDocDate, type DocLocale, type DocumentType, type IssuedDocumentView } from "@/lib/documents";
import { translate, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { downloadAttestationPdf, downloadCardsPdf, photoToPdfImage } from "@/lib/documents-pdf";

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("stu.docs.errOffline");
  return isApiError(err) ? err.message : translate("stu.docs.errGeneric");
}

// Libellés de l'interface (les documents PDF eux-mêmes sont bilingues par conception, voir lib/documents.ts).
const TYPE_LABEL: Record<DocumentType, MessageKey> = {
  ATTESTATION_SCOLARITE: "stu.docs.typeAttestation",
  CARTE_ELEVE: "stu.docs.typeCard",
};
const TYPE_LABEL_LOWER: Record<DocumentType, MessageKey> = {
  ATTESTATION_SCOLARITE: "stu.docs.typeAttestationLower",
  CARTE_ELEVE: "stu.docs.typeCardLower",
};

/**
 * Documents officiels d'un élève : attestation de scolarité (français ou anglais) et carte d'élève. Émettre est
 * idempotent : redemander un document renvoie le même numéro. « Renouveler » en crée un nouveau et annule l'ancien.
 */
export function StudentDocumentsCard({
  studentId,
  hasPhoto,
  open,
  onToggle,
}: {
  studentId: string;
  hasPhoto: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { hasPermission } = useAuth();
  const { t, locale } = useI18n();
  const canCancel = hasPermission("DOCUMENT_CANCEL");
  const [docs, setDocs] = useState<IssuedDocumentView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDocs(await api.get<IssuedDocumentView[]>(`/students/${studentId}/documents`));
    } catch (err) {
      setError(describeError(err));
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fetchPhoto() {
    if (!hasPhoto) return null;
    try {
      return await photoToPdfImage(await api.blob(`/students/${studentId}/photo`));
    } catch {
      return null;
    }
  }

  async function render(doc: IssuedDocumentView, locale: DocLocale) {
    if (doc.type === "ATTESTATION_SCOLARITE") await downloadAttestationPdf(doc, locale);
    else await downloadCardsPdf([{ doc, photo: await fetchPhoto() }], `${t("stu.docs.cardFilePrefix")}-${doc.snapshot.eleve.nom}-${doc.snapshot.eleve.prenom}-${doc.numero}`);
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  /** Émet (ou retrouve) le document puis télécharge son PDF. */
  const issueAndDownload = (type: DocumentType, locale: DocLocale) =>
    run(`${type}-${locale}`, async () => {
      const doc = await api.post<IssuedDocumentView>(`/students/${studentId}/documents`, { type });
      await render(doc, locale);
      await load();
    });

  const renew = (doc: IssuedDocumentView) => {
    if (!confirm(t("stu.docs.confirmRenew", { type: t(TYPE_LABEL_LOWER[doc.type]), number: doc.numero }))) return;
    return run(`renew-${doc.id}`, async () => {
      const fresh = await api.post<IssuedDocumentView>(`/students/${studentId}/documents`, { type: doc.type, renouveler: true });
      setNotice(t("stu.docs.renewed", { fresh: fresh.numero, old: doc.numero }));
      await load();
    });
  };

  const cancel = (doc: IssuedDocumentView) => {
    const motif = prompt(t("stu.docs.promptCancel", { number: doc.numero }));
    if (!motif) return;
    return run(`cancel-${doc.id}`, async () => {
      await api.post(`/documents/${doc.id}/annuler`, { motif });
      await load();
    });
  };

  const active = docs?.filter((d) => !d.annuleLe).length ?? 0;

  return (
    <Card className="lg:col-span-3">
      <h2 className={`flex items-center gap-2 text-sm font-semibold text-ink ${open ? "mb-3" : ""}`}>
        <ExpandButton open={open} onClick={onToggle} label={t("stu.docs.expandLabel")} />
        <FileText size={16} className="text-primary" /> {t("stu.docs.title")}
        {!open && <span className="font-normal text-ink-muted">{t("stu.docs.validCount", { count: active })}</span>}
      </h2>
      {open && (
        <div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy !== null} onClick={() => void issueAndDownload("ATTESTATION_SCOLARITE", "fr")}>
              <FileText size={15} /> {busy === "ATTESTATION_SCOLARITE-fr" ? t("stu.docs.preparing") : t("stu.docs.btnAttestationFr")}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => void issueAndDownload("ATTESTATION_SCOLARITE", "en")}>
              <FileText size={15} /> {busy === "ATTESTATION_SCOLARITE-en" ? t("stu.docs.preparing") : t("stu.docs.btnAttestationEn")}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => void issueAndDownload("CARTE_ELEVE", "fr")}>
              <IdCard size={15} /> {busy === "CARTE_ELEVE-fr" ? t("stu.docs.preparing") : t("stu.docs.btnCard")}
            </Button>
          </div>
          {!hasPhoto && <p className="mt-2 text-xs text-ink-muted">{t("stu.docs.noPhoto")}</p>}
          <ErrorMessage>{error}</ErrorMessage>
          {notice && <SuccessMessage>{notice}</SuccessMessage>}

          {docs && docs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-2 pr-4">{t("stu.docs.cDocument")}</th>
                    <th className="py-2 pr-4">{t("stu.docs.cNumber")}</th>
                    <th className="py-2 pr-4">{t("stu.docs.cIssued")}</th>
                    <th className="py-2 pr-4">{t("stu.docs.cState")}</th>
                    <th className="py-2 pr-4">{t("stu.docs.cActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b border-border">
                      <td className="py-2 pr-4">{t(TYPE_LABEL[d.type])}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{d.numero}</td>
                      <td className="py-2 pr-4">
                        {formatDocDate(d.dateEmission, locale)}
                        <span className="block text-xs text-ink-muted">
                          {d.emisParType === "PARENT" ? t("stu.docs.byParent") : t("stu.docs.bySchool")}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {d.annuleLe ? <Badge color="gray">{t("stu.docs.cancelled")}</Badge> : <Badge color="green">{t("stu.docs.valid")}</Badge>}
                        {d.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">{d.motifAnnulation}</p>}
                      </td>
                      <td className="py-2 pr-4">
                        {!d.annuleLe && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="ghost" disabled={busy !== null} onClick={() => void run(`dl-${d.id}`, () => render(d, "fr"))}>
                              {d.type === "ATTESTATION_SCOLARITE" ? t("stu.docs.reprintFr") : t("stu.docs.reprint")}
                            </Button>
                            {d.type === "ATTESTATION_SCOLARITE" && (
                              <Button variant="ghost" disabled={busy !== null} onClick={() => void run(`dl-en-${d.id}`, () => render(d, "en"))}>
                                {t("stu.docs.reprintEn")}
                              </Button>
                            )}
                            <Button variant="ghost" disabled={busy !== null} onClick={() => void renew(d)}>
                              <RefreshCw size={14} /> {t("stu.docs.renew")}
                            </Button>
                            {canCancel && (
                              <Button variant="ghost" disabled={busy !== null} onClick={() => void cancel(d)}>
                                {t("stu.docs.cancel")}
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {docs && docs.length === 0 && <p className="mt-3 text-sm text-ink-muted">{t("stu.docs.none")}</p>}
        </div>
      )}
    </Card>
  );
}
