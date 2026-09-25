"use client";

import { useTrimmedLogo } from "@/lib/school-brand";

/** Logo de l'école, marges blanches coupées (voir `trimmedLogo`) : plus lisible sur un reçu qu'un logo brut. */
export function SchoolLogo({ logoUrl, className = "h-14 w-auto object-contain" }: { logoUrl: string | null | undefined; className?: string }) {
  const src = useTrimmedLogo(logoUrl);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API, recadré dans le navigateur
  return <img src={src} alt="" className={className} />;
}
