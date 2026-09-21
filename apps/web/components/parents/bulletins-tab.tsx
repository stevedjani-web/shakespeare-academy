"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { downloadBulletinPdf } from "@/lib/bulletin-pdf";
import { formatNote, type BulletinData } from "@/lib/grades";
import { Button, Card, ErrorMessage, Spinner } from "@/components/ui";
import { BulletinView } from "@/components/notes/bulletin-view";

interface Summary {
  id: string;
  trimestre: string;
  classe: string;
  annee: string;
  moyenneGenerale: number | null;
  publieAt: string | null;
}

/** Bulletins publiés d'un enfant : uniquement ce que la Direction a validé puis publié, jamais les notes en direct. */
export function ParentBulletinsTab({ studentId }: { studentId: string }) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [bulletin, setBulletin] = useState<BulletinData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi
      .get<Summary[]>(`/portal/children/${studentId}/bulletins`)
      .then((d) => {
        setList(d);
        setError(null);
      })
      .catch((e) => setError(describePortalError(e)));
  }, [studentId]);

  async function open(id: string) {
    setError(null);
    try {
      setBulletin(await portalApi.get<BulletinData>(`/portal/children/${studentId}/bulletins/${id}`));
    } catch (e) {
      setError(describePortalError(e));
    }
  }

  if (bulletin) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setBulletin(null)}>
            <ArrowLeft size={15} /> Mes bulletins
          </Button>
          <Button variant="secondary" onClick={() => void downloadBulletinPdf(bulletin)}>
            <Download size={15} /> Télécharger en PDF
          </Button>
        </div>
        <BulletinView bulletin={bulletin} />
      </div>
    );
  }

  return (
    <div>
      <ErrorMessage>{error}</ErrorMessage>
      {!list && !error && <Spinner />}
      {list && list.length === 0 && (
        <p className="text-sm text-ink-muted">Aucun bulletin n&apos;est encore disponible. Vous serez prévenu dès qu&apos;un bulletin est publié.</p>
      )}
      <ul className="space-y-2">
        {list?.map((b) => (
          <li key={b.id}>
            <Card interactive>
              <button type="button" onClick={() => void open(b.id)} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="flex items-center gap-3">
                  <FileText size={18} className="text-primary" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {b.trimestre}, {b.annee}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      Classe {b.classe} · moyenne générale {formatNote(b.moyenneGenerale)} / 20
                    </span>
                  </span>
                </span>
                <span className="text-sm font-medium text-primary">Voir</span>
              </button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
