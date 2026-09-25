"use client";

import { useSchoolBrand } from "@/lib/school-brand";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * En-tête des pages publiques (préinscription, suivi) : logo, nom et coordonnées de l'école, et une phrase qui dit
 * à la famille qu'elle est bien sur le site officiel. Les informations viennent du serveur (`/school/public`) :
 * le nom affiché est celui de l'établissement, jamais un texte figé dans la page.
 */
export function SchoolHeader() {
  const { t } = useI18n();
  const { brand, logoSrc } = useSchoolBrand();
  const nom = brand?.nom ?? "Shakespeare Academy";
  const contact = [brand?.adresse, brand?.telephone].filter(Boolean).join(" · ");
  return (
    <header className="mb-6 flex flex-col items-center gap-2 text-center">
      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API, recadré dans le navigateur
        <img src={logoSrc} alt={nom} className="h-20 w-auto max-w-full object-contain" />
      )}
      <p className="font-display text-2xl font-semibold tracking-tight text-ink">{nom}</p>
      {contact && <p className="text-xs text-ink-muted">{contact}</p>}
      <p className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">{t("cnt.pre.official", { school: nom })}</p>
    </header>
  );
}
