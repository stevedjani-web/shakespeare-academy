"use client";

import { useState } from "react";
import { CalendarCheck, QrCode, Sigma } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PageTitle } from "@/components/ui";
import { PointageDayTab } from "@/components/pointage/day-tab";
import { PointageSummaryTab } from "@/components/pointage/summary-tab";
import { PointageCodesTab } from "@/components/pointage/codes-tab";

type Tab = "jour" | "recap" | "qr";

// Suivi du pointage des enseignants (Lot 10) : validation par un tiers, heures effectuées du mois,
// QR codes à imprimer. Les enseignants, eux, pointent depuis « Mon pointage ».
export default function PointageEnseignantsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("TEACHER_CHECKIN_READ");
  const canManageCodes = hasPermission("PEDAGOGY_MANAGE");
  const [tab, setTab] = useState<Tab>("jour");

  if (!canRead) {
    return (
      <div>
        <PageTitle eyebrow="Vie scolaire">Pointage des enseignants</PageTitle>
        <p className="text-sm text-ink-muted">Vous n&apos;avez pas la permission de consulter le pointage des enseignants.</p>
      </div>
    );
  }

  const tabs = [
    { key: "jour" as const, label: "Pointages du jour", icon: CalendarCheck },
    { key: "recap" as const, label: "Heures du mois", icon: Sigma },
    ...(canManageCodes ? [{ key: "qr" as const, label: "QR codes et règles", icon: QrCode }] : []),
  ];

  return (
    <div>
      <PageTitle
        eyebrow="Vie scolaire"
        subtitle="Pointages scannés par les enseignants, validation par la vie scolaire, heures effectuées."
        helpId="pointage-enseignants"
      >
        Pointage des enseignants
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
      {tab === "jour" && <PointageDayTab />}
      {tab === "recap" && <PointageSummaryTab />}
      {tab === "qr" && canManageCodes && <PointageCodesTab />}
    </div>
  );
}
