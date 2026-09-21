"use client";

import { useEffect, useState } from "react";
import { BookOpenText } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { TextbookContext } from "@/lib/textbook";
import { ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { TextbookPanel } from "@/components/textbook/textbook-panel";

// Cahier de textes et devoirs (Lot 16). L'enseignant renseigne ses matières et lit les classes où il enseigne ; la vie
// scolaire et la Direction lisent toute l'école. Les parents voient le cahier de la classe de leur enfant.
export default function TextbookPage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission("TEXTBOOK_WRITE") || hasPermission("TEXTBOOK_READ");
  const [context, setContext] = useState<TextbookContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    api
      .get<TextbookContext>("/textbook/context")
      .then(setContext)
      .catch((err) => setError(describeError(err)));
  }, [allowed]);

  if (!allowed) {
    return (
      <div>
        <PageTitle eyebrow="Vie scolaire">Cahier de textes</PageTitle>
        <p className="text-sm text-ink-muted">Vous n&apos;avez pas la permission de consulter le cahier de textes.</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle eyebrow="Vie scolaire" subtitle="Ce qui a été fait en cours et le travail à faire, visibles des parents de la classe.">
        Cahier de textes
      </PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      {!context ? (
        !error && <Spinner className="h-6 w-6 text-primary" />
      ) : !context.annee ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <BookOpenText size={16} /> Aucune année scolaire n&apos;est active : le cahier de textes se renseigne dans l&apos;année active.
        </p>
      ) : (
        <TextbookPanel context={context} />
      )}
    </div>
  );
}
