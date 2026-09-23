"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Class } from "@/lib/types";
import { PageTitle } from "@/components/ui";
import { useStructure } from "@/components/vie-scolaire/shared";
import { DayTab } from "@/components/appel/day-tab";
import { AbsencesTab } from "@/components/appel/absences-tab";
import { Roster } from "@/components/appel/roster";

type Tab = "appel" | "absences";

// Assiduité (Lot 9, addendum v1.1) : l'appel séance par séance, puis les absences et leurs justificatifs.
// L'appel fonctionne sans Internet : il est gardé sur l'appareil et envoyé au retour du réseau.
export default function AppelPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("ATTENDANCE_READ");
  // Un enseignant (ATTENDANCE_TAKE sans ATTENDANCE_READ) ne voit que ses séances : pas d'onglet des absences.
  const canUse = canRead || hasPermission("ATTENDANCE_TAKE");
  const structure = useStructure();
  const [tab, setTab] = useState<Tab>("appel");
  const [classes, setClasses] = useState<Class[]>([]);
  const [open, setOpen] = useState<{ entryId: string; date: string } | null>(null);

  useEffect(() => {
    if (!structure.activeYear) return;
    void api
      .get<Class[]>(`/classes?academicYearId=${structure.activeYear.id}`)
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [structure.activeYear]);

  if (!canUse) {
    return (
      <div>
        <PageTitle eyebrow="Vie scolaire">Appel et absences</PageTitle>
        <p className="text-sm text-ink-muted">Vous n&apos;avez pas la permission de consulter l&apos;assiduité.</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        eyebrow="Vie scolaire"
        subtitle="Appel des élèves séance par séance, absences, retards et justificatifs."
        helpId="appel"
      >
        Appel et absences
      </PageTitle>

      {open ? (
        <Roster entryId={open.entryId} date={open.date} onBack={() => setOpen(null)} />
      ) : (
        <>
          {canRead && (
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface-muted p-1">
            {(
              [
                ["appel", "Appel", ClipboardCheck],
                ["absences", "Absences et justificatifs", UserX],
              ] as const
            ).map(([key, label, Icon]) => (
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
          )}
          {tab === "appel" && <DayTab classes={classes} onOpen={(entryId, date) => setOpen({ entryId, date })} />}
          {canRead && tab === "absences" && <AbsencesTab classes={classes} />}
        </>
      )}
    </div>
  );
}
