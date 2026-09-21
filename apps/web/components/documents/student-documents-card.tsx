"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, IdCard, RefreshCw } from "lucide-react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { Badge, Button, Card, ErrorMessage, SuccessMessage } from "@/components/ui";
import { ExpandButton } from "@/components/expand";
import { DOCUMENT_TYPE_LABEL, formatDocDate, type DocLocale, type DocumentType, type IssuedDocumentView } from "@/lib/documents";
import { downloadAttestationPdf, downloadCardsPdf, photoToPdfImage } from "@/lib/documents-pdf";

function describeError(err: unknown): string {
  if (isOfflineError(err)) return "Cette action nécessite une connexion Internet. Réessayez quand elle sera revenue.";
  return isApiError(err) ? err.message : "Une erreur est survenue.";
}

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
    else await downloadCardsPdf([{ doc, photo: await fetchPhoto() }], `Carte-${doc.snapshot.eleve.nom}-${doc.snapshot.eleve.prenom}-${doc.numero}`);
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
    if (!confirm(`Créer un nouveau ${DOCUMENT_TYPE_LABEL[doc.type].toLowerCase()} ? L'ancien (${doc.numero}) sera annulé.`)) return;
    return run(`renew-${doc.id}`, async () => {
      const fresh = await api.post<IssuedDocumentView>(`/students/${studentId}/documents`, { type: doc.type, renouveler: true });
      setNotice(`Nouveau document ${fresh.numero} créé, ${doc.numero} annulé.`);
      await load();
    });
  };

  const cancel = (doc: IssuedDocumentView) => {
    const motif = prompt(`Motif de l'annulation de ${doc.numero} (obligatoire) :`);
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
        <ExpandButton open={open} onClick={onToggle} label="les documents officiels" />
        <FileText size={16} className="text-primary" /> Documents officiels
        {!open && <span className="font-normal text-ink-muted">{active} document(s) valide(s)</span>}
      </h2>
      {open && (
        <div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy !== null} onClick={() => void issueAndDownload("ATTESTATION_SCOLARITE", "fr")}>
              <FileText size={15} /> {busy === "ATTESTATION_SCOLARITE-fr" ? "Préparation…" : "Attestation (français)"}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => void issueAndDownload("ATTESTATION_SCOLARITE", "en")}>
              <FileText size={15} /> {busy === "ATTESTATION_SCOLARITE-en" ? "Préparation…" : "Certificate (English)"}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => void issueAndDownload("CARTE_ELEVE", "fr")}>
              <IdCard size={15} /> {busy === "CARTE_ELEVE-fr" ? "Préparation…" : "Carte d'élève"}
            </Button>
          </div>
          {!hasPhoto && <p className="mt-2 text-xs text-ink-muted">Aucune photo au dossier : la carte affichera les initiales. Ajoutez une photo depuis l&apos;en-tête du dossier.</p>}
          <ErrorMessage>{error}</ErrorMessage>
          {notice && <SuccessMessage>{notice}</SuccessMessage>}

          {docs && docs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-2 pr-4">Document</th>
                    <th className="py-2 pr-4">Numéro</th>
                    <th className="py-2 pr-4">Émis le</th>
                    <th className="py-2 pr-4">État</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b border-border">
                      <td className="py-2 pr-4">{DOCUMENT_TYPE_LABEL[d.type]}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{d.numero}</td>
                      <td className="py-2 pr-4">
                        {formatDocDate(d.dateEmission, "fr")}
                        <span className="block text-xs text-ink-muted">{d.emisParType === "PARENT" ? "par le parent" : "par l'école"}</span>
                      </td>
                      <td className="py-2 pr-4">
                        {d.annuleLe ? <Badge color="gray">Annulé</Badge> : <Badge color="green">Valide</Badge>}
                        {d.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">{d.motifAnnulation}</p>}
                      </td>
                      <td className="py-2 pr-4">
                        {!d.annuleLe && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="ghost" disabled={busy !== null} onClick={() => void run(`dl-${d.id}`, () => render(d, "fr"))}>
                              {d.type === "ATTESTATION_SCOLARITE" ? "Réimprimer (FR)" : "Réimprimer"}
                            </Button>
                            {d.type === "ATTESTATION_SCOLARITE" && (
                              <Button variant="ghost" disabled={busy !== null} onClick={() => void run(`dl-en-${d.id}`, () => render(d, "en"))}>
                                Reprint (EN)
                              </Button>
                            )}
                            <Button variant="ghost" disabled={busy !== null} onClick={() => void renew(d)}>
                              <RefreshCw size={14} /> Renouveler
                            </Button>
                            {canCancel && (
                              <Button variant="ghost" disabled={busy !== null} onClick={() => void cancel(d)}>
                                Annuler
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
          {docs && docs.length === 0 && <p className="mt-3 text-sm text-ink-muted">Aucun document émis pour cet élève.</p>}
        </div>
      )}
    </Card>
  );
}
