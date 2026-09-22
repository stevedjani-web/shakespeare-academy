"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button, PageTitle } from "@/components/ui";
import { ReportForm } from "@/components/discipline/report-form";
import { RecordsPanel } from "@/components/discipline/records-panel";
import { TodoPanel } from "@/components/discipline/todo-panel";
import { ConvocationsPanel } from "@/components/discipline/convocations-panel";
import { CataloguesPanel } from "@/components/discipline/catalogues-panel";

type Tab = "signalements" | "traiter" | "convocations" | "catalogues";

/**
 * Discipline (Lot 20). Un enseignant y signale pour ses classes et relit ses signalements ; la vie scolaire lit tout et
 * convoque ; la Direction décide, publie et annule. Le serveur applique ces droits, l'écran n'en montre que le reflet.
 */
export default function DisciplinePage() {
  const { hasPermission } = useAuth();
  const canReport = hasPermission("DISCIPLINE_REPORT");
  const canReadAll = hasPermission("DISCIPLINE_READ") || hasPermission("DISCIPLINE_DECIDE");
  const canDecide = hasPermission("DISCIPLINE_DECIDE");
  const canConvoke = hasPermission("DISCIPLINE_CONVOKE");
  const canCatalogue = hasPermission("PEDAGOGY_MANAGE");

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: "signalements", label: canReadAll ? "Signalements" : "Mes signalements", visible: canReport || canReadAll },
    { key: "traiter", label: "À traiter", visible: canDecide },
    { key: "convocations", label: "Convocations", visible: canConvoke || canReadAll },
    { key: "catalogues", label: "Catalogues", visible: canCatalogue },
  ];
  const visible = tabs.filter((t) => t.visible);
  const [tab, setTab] = useState<Tab>(visible[0]?.key ?? "signalements");
  const [reporting, setReporting] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageTitle
          eyebrow="Lot 20"
          subtitle="Signalements, sanctions, convocations des familles et points positifs. Les textes saisis ici sont confidentiels."
        >
          Discipline
        </PageTitle>
        {canReport && tab === "signalements" && !reporting && <Button onClick={() => setReporting(true)}>Signaler</Button>}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface-muted p-1">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "signalements" && (
        <>
          {reporting && (
            <ReportForm
              onCancel={() => setReporting(false)}
              onDone={() => {
                setReporting(false);
                bump();
              }}
            />
          )}
          <RecordsPanel canDecide={canDecide} showAuthor={canReadAll} version={version} onChanged={bump} />
        </>
      )}
      {tab === "traiter" && canDecide && <TodoPanel version={version} onChanged={bump} />}
      {tab === "convocations" && <ConvocationsPanel canConvoke={canConvoke} />}
      {tab === "catalogues" && canCatalogue && <CataloguesPanel />}
    </div>
  );
}
