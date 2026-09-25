"use client";

import { useEffect, useState } from "react";
import { IdCard } from "lucide-react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Button, Card, ErrorMessage, Select, SuccessMessage } from "@/components/ui";
import type { AcademicYear, Class } from "@/lib/types";
import type { IssuedDocumentView } from "@/lib/documents";
import { downloadCardsPdf, photoToPdfImage, type CardSource } from "@/lib/documents-pdf";

interface ClassCardsResult {
  classe: string;
  documents: IssuedDocumentView[];
  cartesCreees: number;
}

/**
 * Cartes d'élèves d'une classe en une fois : émet celles qui manquent (les autres gardent leur numéro) et produit un
 * seul PDF, recto et verso pour chaque élève. Relancer complète ce qui manque sans rien dupliquer.
 */
export function ClassCardsPanel() {
  const { t } = useI18n();
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const years = await api.get<AcademicYear[]>("/academic-years");
        const active = years.find((y) => y.statut === "ACTIVE");
        if (!active) return;
        setClasses(await api.get<Class[]>(`/classes?academicYearId=${active.id}`));
      } catch {
        // Facultatif : sans classes, le panneau reste simplement vide.
      }
    })();
  }, []);

  async function generate() {
    if (!classId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setProgress(t("stu.cards.issuing"));
    try {
      const res = await api.post<ClassCardsResult>(`/documents/class-cards/${classId}`);
      const cards: CardSource[] = [];
      for (const [i, doc] of res.documents.entries()) {
        setProgress(t("stu.cards.preparingPhotos", { current: i + 1, total: res.documents.length }));
        let photo = null;
        try {
          photo = await photoToPdfImage(await api.blob(`/students/${doc.studentId}/photo`));
        } catch {
          // Pas de photo pour cet élève : la carte affichera ses initiales.
        }
        cards.push({ doc, photo });
      }
      setProgress(t("stu.cards.creatingPdf"));
      await downloadCardsPdf(cards, `${t("stu.cards.filePrefix")}-${res.classe}`);
      setNotice(
        t("stu.cards.summary", {
          count: res.documents.length,
          classe: res.classe,
          created: res.cartesCreees,
          existing: res.documents.length - res.cartesCreees,
        }),
      );
    } catch (err) {
      setError(isOfflineError(err) ? t("stu.cards.errOffline") : isApiError(err) ? err.message : t("stu.cards.errGeneric"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (classes.length === 0) return null;
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <IdCard size={16} className="text-primary" /> {t("stu.cards.title")}
          </span>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t("stu.cards.chooseClass")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={() => void generate()} disabled={busy || !classId}>
          {busy ? (progress ?? "…") : t("stu.cards.produce")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{t("stu.cards.hint")}</p>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
    </Card>
  );
}
