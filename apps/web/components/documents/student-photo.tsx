"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { api, isOfflineError } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photo de l'élève, ou ses initiales. La photo est protégée (jamais dans le dossier public de l'API) : elle est lue avec
 * le jeton de session puis affichée depuis un objet local, jamais depuis une adresse ouverte à tous.
 */
export function StudentPhoto({
  studentId,
  photoRef,
  initials,
  canEdit,
  onChanged,
}: {
  studentId: string;
  /** Référence de la photo au dossier (change à chaque remplacement) ; vide s'il n'y en a pas. */
  photoRef: string | null;
  initials: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    if (!photoRef) {
      setSrc(null);
      return;
    }
    api
      .blob(`/students/${studentId}/photo`)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [studentId, photoRef]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError("Format non supporté (JPEG, PNG ou WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Photo trop lourde (2 Mo au plus).");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.upload(`/students/${studentId}/photo`, form);
      onChanged();
    } catch (err) {
      setError(isOfflineError(err) ? "Connexion Internet nécessaire pour envoyer la photo." : isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- objet local créé depuis un fichier protégé
          <img src={src} alt="" className="h-16 w-14 rounded-2xl border border-border object-cover" />
        ) : (
          <span className="flex h-16 w-14 items-center justify-center rounded-2xl bg-primary-soft font-display text-xl font-semibold text-primary">{initials}</span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            aria-label={photoRef ? "Changer la photo" : "Ajouter une photo"}
            className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-primary shadow-sm hover:bg-surface-muted disabled:opacity-50"
          >
            <Camera size={14} />
          </button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleFile(e)} />
      </div>
      {busy && <span className="text-[11px] text-ink-muted">Envoi…</span>}
      {error && <span className="max-w-32 text-center text-[11px] text-danger">{error}</span>}
    </div>
  );
}
