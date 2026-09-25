"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, ClipboardList, FileText, Settings2, Table2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { GradeContext } from "@/lib/grades";
import { PageTitle, Spinner, ErrorMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { EvaluationsTab } from "@/components/notes/evaluations-tab";
import { ResultsTab } from "@/components/notes/results-tab";
import { BulletinsTab } from "@/components/notes/bulletins-tab";
import { GradeSettingsTab } from "@/components/notes/settings-tab";

type Tab = "evaluations" | "resultats" | "bulletins" | "reglages";

// Notes, évaluations et bulletins (Lot 15). L'enseignant saisit les notes de SES matières ; la Direction voit toute
// l'école, valide, publie et corrige. La saisie fonctionne sans Internet : elle est envoyée au retour du réseau.
export default function NotesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canEnter = hasPermission("GRADE_ENTER");
  const canRead = hasPermission("GRADE_READ");
  const canBulletins = canRead || hasPermission("BULLETIN_VALIDATE");
  const canSettings = hasPermission("PEDAGOGY_MANAGE");
  const [tab, setTab] = useState<Tab>(canEnter ? "evaluations" : "resultats");
  const [context, setContext] = useState<GradeContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canEnter && !canRead) return;
    api
      .get<GradeContext>("/grades/context")
      .then(setContext)
      .catch((err) => setError(describeError(err)));
  }, [canEnter, canRead]);

  if (!canEnter && !canRead) {
    return (
      <div>
        <PageTitle eyebrow={t("acd.grades.eyebrow")}>{t("acd.grades.title")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("acd.grades.noPermission")}</p>
      </div>
    );
  }

  const tabs = [
    ...(canEnter ? [{ key: "evaluations" as const, label: t("acd.grades.tabEvaluations"), icon: ClipboardList }] : []),
    { key: "resultats" as const, label: t("acd.grades.tabResults"), icon: Table2 },
    ...(canBulletins ? [{ key: "bulletins" as const, label: t("acd.grades.tabBulletins"), icon: FileText }] : []),
    ...(canSettings ? [{ key: "reglages" as const, label: t("acd.grades.tabSettings"), icon: Settings2 }] : []),
  ];

  return (
    <div>
      <PageTitle eyebrow={t("acd.grades.eyebrow")} subtitle={t("acd.grades.subtitle")} helpId="notes">
        {t("acd.grades.title")}
      </PageTitle>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface-muted p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {tab === "reglages" && canSettings ? (
        <GradeSettingsTab />
      ) : !context ? (
        !error && <Spinner className="h-6 w-6 text-primary" />
      ) : !context.annee ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <BookOpenCheck size={16} /> {t("acd.grades.noYear")}
        </p>
      ) : (
        <>
          {tab === "evaluations" && canEnter && <EvaluationsTab context={context} />}
          {tab === "resultats" && <ResultsTab context={context} />}
          {tab === "bulletins" && canBulletins && <BulletinsTab context={context} />}
        </>
      )}
    </div>
  );
}
