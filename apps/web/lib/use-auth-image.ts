"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Lit une image protégée (cachet de l'établissement, signature d'un caissier) avec le jeton d'accès : une balise
 * <img src> ne peut pas porter d'en-tête Authorization, et ces images ne sont volontairement jamais publiques.
 * Renvoie `null` tant qu'elle charge et quand elle n'existe pas (404) : le reçu affiche alors l'emplacement vide.
 */
export function useAuthImage(path: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    api
      .blob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return src;
}
