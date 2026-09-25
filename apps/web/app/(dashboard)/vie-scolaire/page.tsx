"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { useAuth } from "@/contexts/auth-context";
import type { PedagogySummary } from "@/lib/types";
import { PageTitle } from "@/components/ui";
import { BookOpen, CalendarDays, Clock, DoorOpen, LayoutList, ListChecks, Sparkles, UserX, Users } from "lucide-react";
import { RecapTab, type VieScolaireTab } from "@/components/vie-scolaire/recap-tab";
import { HorairesTab } from "@/components/vie-scolaire/horaires-tab";
import { MatieresTab } from "@/components/vie-scolaire/matieres-tab";
import { EnseignantsTab } from "@/components/vie-scolaire/enseignants-tab";
import { AffectationsTab } from "@/components/vie-scolaire/affectations-tab";
import { CalendrierTab } from "@/components/vie-scolaire/calendrier-tab";
import { SallesTab } from "@/components/vie-scolaire/salles-tab";
import { AssiduiteTab } from "@/components/vie-scolaire/assiduite-tab";
import { AssistantTab } from "@/components/vie-scolaire/assistant-tab";
import { describeError, useStructure } from "@/components/vie-scolaire/shared";

const TABS: Array<{ key: VieScolaireTab; label: MessageKey; icon: typeof Clock }> = [
  { key: "recap", label: "sl.tab.recap", icon: LayoutList },
  { key: "horaires", label: "sl.tab.horaires", icon: Clock },
  { key: "matieres", label: "sl.tab.matieres", icon: BookOpen },
  { key: "enseignants", label: "sl.tab.enseignants", icon: Users },
  { key: "affectations", label: "sl.tab.affectations", icon: ListChecks },
  { key: "calendrier", label: "sl.tab.calendrier", icon: CalendarDays },
  { key: "salles", label: "sl.tab.salles", icon: DoorOpen },
  { key: "assiduite", label: "sl.tab.assiduite", icon: UserX },
  { key: "assistant", label: "acd.ai.tab", icon: Sparkles },
];

// Espace de saisie du référentiel pédagogique (Lot 7, addendum v1.1) : la Direction y saisit elle-même
// horaires, matières, enseignants, affectations, calendrier et salles. Rien n'est prérempli.
export default function VieScolairePage() {
  const { hasPermission } = useAuth();
  const { t } = useI18n();
  const canManage = hasPermission("PEDAGOGY_MANAGE");
  const structure = useStructure();
  const [tab, setTab] = useState<VieScolaireTab>("recap");
  const [summary, setSummary] = useState<PedagogySummary | null>(null);
  const [yearId, setYearId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!yearId && structure.activeYear) setYearId(structure.activeYear.id);
  }, [structure.activeYear, yearId]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.get<PedagogySummary>(`/pedagogy/summary${yearId ? `?academicYearId=${yearId}` : ""}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [yearId]);

  useEffect(() => {
    if (canManage && structure.loaded) void loadSummary();
  }, [canManage, structure.loaded, loadSummary]);

  if (!canManage) {
    return (
      <div>
        <PageTitle eyebrow={t("sl.page.title")} subtitle={t("sl.page.noAccessSubtitle")}>
          {t("sl.page.title")}
        </PageTitle>
        <p className="text-sm text-ink-muted">{t("sl.page.noPermission")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        eyebrow={t("sl.page.title")}
        subtitle={t("sl.page.subtitle")}
        helpId="vie-scolaire"
      >
        {t("sl.page.title")}
      </PageTitle>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface-muted p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon size={15} />
            {t(label)}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {tab === "recap" && (
        <RecapTab
          summary={summary}
          years={structure.years}
          yearId={yearId}
          onYearChange={setYearId}
          onGo={setTab}
          onChanged={() => void loadSummary()}
        />
      )}
      {tab === "horaires" && <HorairesTab sections={structure.sections} onChanged={() => void loadSummary()} />}
      {tab === "matieres" && (
        <MatieresTab
          sections={structure.sections}
          cycles={structure.cycles}
          levels={structure.levels}
          levelLabel={structure.levelLabel}
          onChanged={() => void loadSummary()}
        />
      )}
      {tab === "enseignants" && <EnseignantsTab onChanged={() => void loadSummary()} />}
      {tab === "affectations" && (
        <AffectationsTab
          years={structure.years}
          activeYear={structure.activeYear}
          levelLabel={structure.levelLabel}
          onChanged={() => void loadSummary()}
        />
      )}
      {tab === "calendrier" && (
        <CalendrierTab years={structure.years} activeYear={structure.activeYear} onChanged={() => void loadSummary()} />
      )}
      {tab === "salles" && <SallesTab onChanged={() => void loadSummary()} />}
      {tab === "assiduite" && <AssiduiteTab onChanged={() => void loadSummary()} />}
      {tab === "assistant" && <AssistantTab />}
    </div>
  );
}
