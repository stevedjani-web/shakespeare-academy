"use client";

import { useRef } from "react";
import { Camera, Check, GalleryHorizontal, RotateCcw, UserRound } from "lucide-react";
import { FieldError } from "@/components/family-form/fields";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Écran de la photo (obligatoire) : un grand cadre portrait, « Prendre un selfie » (appareil photo avant du téléphone) et
 * « Choisir dans mes photos ». Le recadrage est fait par le composant de cadrage de la page.
 */
export function PhotoStep({ photoUrl, error, onFile }: { photoUrl: string | null; error?: string | null; onFile: (file: File | undefined) => void }) {
  const { t } = useI18n();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files?.[0]);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative flex aspect-[3/4] w-48 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed bg-surface-muted ${photoUrl ? "border-success" : error ? "border-danger" : "border-border"}`}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local de la photo choisie
          <img src={photoUrl} alt={t("tco.w.photo.alt")} className="h-full w-full object-cover" />
        ) : (
          <UserRound size={84} strokeWidth={1.2} aria-hidden className="text-ink-muted/50" />
        )}
        {photoUrl && (
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-success text-white shadow">
            <Check size={18} aria-hidden />
          </span>
        )}
      </div>

      <div className="mt-5 grid w-full gap-2.5">
        <button
          type="button"
          onClick={() => camera.current?.click()}
          className="sa-interactive inline-flex min-h-13 items-center justify-center gap-2.5 rounded-2xl bg-primary px-5 py-3.5 text-base font-semibold text-white active:bg-primary-dark"
        >
          {photoUrl ? <RotateCcw size={19} aria-hidden /> : <Camera size={19} aria-hidden />}
          {photoUrl ? t("tco.w.photo.retake") : t("tco.w.photo.selfie")}
        </button>
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className="sa-interactive inline-flex min-h-13 items-center justify-center gap-2.5 rounded-2xl border-2 border-border bg-surface px-5 py-3.5 text-base font-semibold text-ink active:bg-surface-muted"
        >
          <GalleryHorizontal size={19} aria-hidden />
          {t("tco.w.photo.gallery")}
        </button>
      </div>
      {/* « capture » ouvre directement l'appareil photo avant ; sans lui, la galerie du téléphone. */}
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={pick} />
      <div className="w-full">
        <FieldError id="t-photo-error">{error}</FieldError>
      </div>
    </div>
  );
}
