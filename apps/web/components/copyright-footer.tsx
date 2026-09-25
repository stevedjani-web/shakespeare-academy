"use client";

import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Mention légale de l'éditeur du logiciel (INFRAONE SYSTEMS), distincte du nom de l'établissement
 * (Shakespeare Academy, déjà affiché ailleurs) — un seul composant partagé pour ne jamais la faire
 * diverger d'un écran à l'autre. Année calculée (jamais figée en dur), comme le faisait déjà la mention
 * "© {année} Shakespeare Academy" du panneau de marque de la page de connexion.
 */
export function CopyrightFooter({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return <p className={`text-center text-[11px] text-ink-muted ${className}`}>{t("common.copyright", { year: new Date().getFullYear() })}</p>;
}
