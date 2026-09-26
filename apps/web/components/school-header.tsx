"use client";

import { useSchoolBrand } from "@/lib/school-brand";

/**
 * Titre des pages publiques (préinscription, suivi) : « Nom de l'école - Titre de la page », sur une seule ligne,
 * puis une phrase d'explication. Le nom vient du serveur (`/school/public`), jamais d'un texte figé dans la page :
 * c'est ce qui dit à la famille qu'elle est bien chez l'école. Sans logo ni coordonnées, pour ne pas prendre de
 * place avant le formulaire.
 */
export function SchoolHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { brand } = useSchoolBrand({ withLogo: false });
  const nom = brand?.nom ?? "Shakespeare Academy";
  return (
    <div className="mb-5">
      <h1 className="font-display text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
        {nom} - {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}
