"use client";

import { useEffect, useState } from "react";
import { BookOpenText } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { TextbookContext } from "@/lib/textbook";
import { ErrorMessage, PageTitle, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { TextbookPanel } from "@/components/textbook/textbook-panel";

// Cahier de textes et devoirs (Lot 16). L'enseignant renseigne ses matières et lit les classes où il enseigne ; la vie
// scolaire et la Direction lisent toute l'école. Les parents voient le cahier de la classe de leur enfant.
export default function TextbookPage() {
  const { t } = useI18n();
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
        <PageTitle eyebrow={t("acd.tb.eyebrow")}>{t("acd.tb.title")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("acd.tb.noPermission")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle eyebrow={t("acd.tb.eyebrow")} subtitle={t("acd.tb.subtitle")} helpId="cahier-de-textes">
        {t("acd.tb.title")}
      </PageTitle>
      <ErrorMessage>{error}</ErrorMessage>
      {!context ? (
        !error && <Spinner className="h-6 w-6 text-primary" />
      ) : !context.annee ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <BookOpenText size={16} /> {t("acd.tb.noYear")}
        </p>
      ) : (
        <TextbookPanel context={context} />
      )}
    </div>
  );
}
