"use client";

import { useSchoolBrand } from "@/lib/school-brand";

/**
 * Titre des pages publiques (préinscription, suivi) : « Nom de l'école - Titre de la page », sur une seule ligne.
 * Le nom vient du serveur (`/school/public`), jamais d'un texte figé dans la page : c'est ce qui dit à la famille
 * qu'elle est bien chez l'école. Sans logo ni coordonnées, pour ne pas prendre de place avant le formulaire.
 */
export function SchoolHeader({ title }: { title: string }) {
  const { brand } = useSchoolBrand({ withLogo: false });
  const nom = brand?.nom ?? "Shakespeare Academy";
  return (
    <h1 className="mb-5 font-display text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
      {nom} - {title}
    </h1>
  );
}
