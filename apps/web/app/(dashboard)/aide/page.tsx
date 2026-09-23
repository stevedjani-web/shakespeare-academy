"use client";

import { PageTitle, Card, EmptyState } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { HELP_CONTENT, HELP_ORDER } from "@/lib/help-content";
import { HelpCircle } from "lucide-react";

/**
 * Page d'aide authentifiée (demande explicite, 23 septembre 2026), distincte de /guide (publique,
 * généraliste, pour présenter l'application à l'extérieur). Ici, chaque rubrique n'apparaît que si le
 * compte connecté a réellement le droit d'y accéder — mêmes codes de permission que la navigation
 * (`components/app-shell.tsx`), jamais une nouvelle règle de visibilité à maintenir en double. Le
 * contenu vient uniquement de `lib/help-content.ts` : la puce d'aide affichée sur chaque écran (`HelpTip`)
 * et cette page se nourrissent de la même source, jamais deux textes qui pourraient diverger avec le temps.
 */
export default function AidePage() {
  const { hasPermission } = useAuth();

  const visible = HELP_ORDER.map((id) => HELP_CONTENT[id]).filter((entry) => {
    if (!entry) return false;
    if (entry.permission && !hasPermission(entry.permission)) return false;
    if (entry.anyPermission && !entry.anyPermission.some((code) => hasPermission(code))) return false;
    return true;
  });

  return (
    <div>
      <PageTitle
        eyebrow="Aide"
        subtitle="Les conseils affichés sur chaque écran, réunis ici. Seules les rubriques auxquelles votre compte a accès apparaissent."
      >
        Aide
      </PageTitle>

      {visible.length === 0 ? (
        <EmptyState
          icon={<HelpCircle />}
          title="Aucune rubrique d'aide pour votre compte pour l'instant."
          description="D'autres écrans seront couverts progressivement."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((entry) => (
            <Card key={entry.id}>
              <div id={entry.id} className="scroll-mt-6">
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <HelpCircle size={18} />
                  </div>
                  <h2 className="font-display text-lg font-semibold text-ink">{entry.title}</h2>
                </div>
                <ul className="space-y-2 text-sm text-ink-muted">
                  {entry.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-0.5 text-primary">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
