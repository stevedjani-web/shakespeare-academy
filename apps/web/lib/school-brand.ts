"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

/** Identité publique de l'établissement (`GET /school/public`, sans compte) et logo recadré. */
export interface SchoolBrand {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  logoUrl: string | null;
}

const STORAGE_KEY = "sa.brand";
const MAX_WIDTH = 640;
// Un pixel plus clair que ce seuil (et un damier gris très clair) est considéré comme du fond.
const BACKGROUND_MIN = 232;
const FADE_MIN = 190;

const trimmedLogos = new Map<string, Promise<string | null>>();
let brandPromise: Promise<SchoolBrand | null> | null = null;

/**
 * Coupe les marges blanches ou transparentes autour d'un logo (les logos importés en ont souvent beaucoup,
 * ce qui les rend minuscules dans un menu ou sur un reçu). Fonctionne pour tout logo, sans réglage propre à
 * l'image de l'école. Renvoie une image en data URL, ou null si le recadrage est impossible (l'appelant
 * retombe alors sur l'image d'origine).
 */
export function trimmedLogo(logoUrl: string): Promise<string | null> {
  const cached = trimmedLogos.get(logoUrl);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(`${API_URL}${logoUrl}`);
      if (!res.ok) return null;
      const bitmap = await createImageBitmap(await res.blob());
      const scale = Math.min(1, MAX_WIDTH / bitmap.width);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const opaque = data[i + 3] > 24;
          const dark = Math.min(data[i], data[i + 1], data[i + 2]) < BACKGROUND_MIN;
          if (opaque && dark) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      const pad = Math.round(Math.max(w, h) * 0.015);
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const sw = Math.min(w, maxX + pad + 1) - sx;
      const sh = Math.min(h, maxY + pad + 1) - sy;
      const out = document.createElement("canvas");
      out.width = sw;
      out.height = sh;
      const octx = out.getContext("2d");
      if (!octx) return null;
      octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      // Le fond (blanc ou damier très clair) devient transparent, avec un dégradé sur les bords des lettres :
      // le logo se pose sans cadre blanc sur une page crème comme sur un reçu.
      const cut = octx.getImageData(0, 0, sw, sh);
      for (let i = 0; i < cut.data.length; i += 4) {
        const m = Math.min(cut.data[i], cut.data[i + 1], cut.data[i + 2]);
        if (m >= BACKGROUND_MIN) cut.data[i + 3] = 0;
        else if (m > FADE_MIN) cut.data[i + 3] = Math.round((cut.data[i + 3] * (BACKGROUND_MIN - m)) / (BACKGROUND_MIN - FADE_MIN));
      }
      octx.putImageData(cut, 0, 0);
      return out.toDataURL("image/png");
    } catch {
      return null;
    }
  })();
  trimmedLogos.set(logoUrl, promise);
  return promise;
}

function readStored(): (SchoolBrand & { logo: string | null }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SchoolBrand & { logo: string | null }) : null;
  } catch {
    return null;
  }
}

function fetchBrand(): Promise<SchoolBrand | null> {
  if (!brandPromise) {
    brandPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/school/public`);
        if (!res.ok) return null;
        return (await res.json()) as SchoolBrand;
      } catch {
        return null;
      }
    })().then((brand) => {
      if (!brand) brandPromise = null; // pas de mémorisation d'un échec : on réessaiera
      return brand;
    });
  }
  return brandPromise;
}

export interface UseSchoolBrand {
  /** Vrai tant que rien n'est connu (ni copie gardée, ni réponse du serveur). */
  loading: boolean;
  brand: SchoolBrand | null;
  /** Logo recadré (data URL), ou l'adresse de l'image d'origine si le recadrage a échoué. */
  logoSrc: string | null;
}

/** Marque de l'établissement : la dernière copie connue s'affiche tout de suite, le serveur la met à jour. */
export function useSchoolBrand(): UseSchoolBrand {
  const [state, setState] = useState<UseSchoolBrand>({ loading: true, brand: null, logoSrc: null });

  useEffect(() => {
    let cancelled = false;
    const stored = readStored();
    if (stored) {
      setState({ loading: false, brand: stored, logoSrc: stored.logo });
    }
    void fetchBrand().then(async (brand) => {
      if (cancelled) return;
      if (!brand) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      // Le nom et les coordonnées s'affichent tout de suite ; le logo (une image lourde à télécharger la première
      // fois) les rejoint quand il est prêt.
      setState((s) => ({ loading: false, brand, logoSrc: brand.logoUrl ? s.logoSrc : null }));
      const trimmed = brand.logoUrl ? await trimmedLogo(brand.logoUrl) : null;
      const logoSrc = trimmed ?? (brand.logoUrl ? `${API_URL}${brand.logoUrl}` : null);
      if (cancelled) return;
      setState({ loading: false, brand, logoSrc });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...brand, logo: trimmed }));
      } catch {
        // stockage plein ou bloqué : la marque se recharge simplement à la prochaine visite
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Version « une seule fois » d'un logo recadré, pour les reçus qui connaissent déjà l'adresse du logo. */
export function useTrimmedLogo(logoUrl: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUrl) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void trimmedLogo(logoUrl).then((trimmed) => {
      if (!cancelled) setSrc(trimmed ?? `${API_URL}${logoUrl}`);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
  return src;
}
