"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { BulletinData } from "@/lib/grades";
import { downloadBulletinPdf } from "@/lib/bulletin-pdf";
import { Button, Spinner } from "@/components/ui";
import { BulletinView } from "@/components/notes/bulletin-view";
import { ArrowLeft, Download, Printer } from "lucide-react";

// Page d'impression d'un bulletin (personnel autorisé). Hors du groupe (dashboard), comme les reçus.
export default function BulletinPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [bulletin, setBulletin] = useState<BulletinData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api
      .get<BulletinData>(`/grades/bulletins/${params.id}`)
      .then(setBulletin)
      .catch(() => setError("Bulletin introuvable ou trimestre rouvert."));
  }, [params.id, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }
  if (error) return <p className="p-8 text-center text-danger">{error}</p>;
  if (!bulletin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 print:max-w-full print:p-0">
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft size={15} /> Retour
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={15} /> Imprimer
        </Button>
        <Button variant="secondary" onClick={() => void downloadBulletinPdf(bulletin)}>
          <Download size={15} /> Télécharger en PDF
        </Button>
      </div>
      <BulletinView bulletin={bulletin} />
    </div>
  );
}
