"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useAuthImage } from "@/lib/use-auth-image";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Button, ErrorMessage } from "@/components/ui";

/**
 * Enregistrement d'une image posée automatiquement sur les reçus : le cachet de l'établissement ou la signature du
 * caissier. L'image est privée (lue avec le jeton, jamais une adresse publique) et réduite par le serveur à
 * l'enregistrement. `mix-blend-multiply` fait disparaître le fond blanc d'une photo : seule l'encre reste visible.
 */
export function SealUpload({
  path,
  title,
  help,
  canEdit = true,
}: {
  /** `/receipt-assets/cachet` ou `/receipt-assets/signature/me`. */
  path: string;
  title: string;
  help: string;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Le numéro de version relit l'image après un envoi ou un retrait : le chemin change, jamais l'adresse réelle.
  const src = useAuthImage(`${path}?v=${version}`);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload(path, formData);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await api.delete(path);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{title}</p>
      <div className="mb-3 flex h-24 max-w-60 items-center justify-center rounded-xl border border-dashed border-border bg-white p-1.5">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- image privée lue avec le jeton, affichée depuis un blob local
          <img src={src} alt={title} className="max-h-full max-w-full object-contain mix-blend-multiply" />
        ) : (
          <span className="text-xs text-ink-muted">{t("adm.seal.none")}</span>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label>
            <span className="sa-interactive inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-primary/40 hover:bg-primary-soft">
              {busy ? t("adm.school.uploading") : src ? t("adm.seal.change") : t("adm.seal.add")}
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => void onFile(e)} />
          </label>
          {src && (
            <Button variant="ghost" type="button" disabled={busy} onClick={() => void remove()}>
              {t("adm.seal.remove")}
            </Button>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-muted">{help}</p>
      <ErrorMessage>{error}</ErrorMessage>
    </div>
  );
}
