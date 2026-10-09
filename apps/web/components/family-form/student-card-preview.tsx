"use client";

import { useRef } from "react";
import { Camera, Crop, GraduationCap, ImagePlus, Trash2, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatDate } from "@/lib/format";
import { childInitials, childSwatch } from "@/lib/pre-registration-form";

/**
 * « Demi-carte » d'élève, aperçu en direct : la photo d'identité facultative à gauche, le nom, la classe et la date de
 * naissance à droite, dans la couleur de la fiche. Elle se remplit au fil de la saisie, et c'est là que le parent ajoute
 * la photo (appareil photo ou galerie), puis la recadre si besoin.
 */
export function StudentCardPreview({
  index,
  nom,
  prenom,
  classe,
  dateNaissance,
  school,
  photoUrl,
  onFile,
  onAdjust,
  onRemove,
}: {
  index: number;
  nom: string;
  prenom: string;
  classe: string;
  dateNaissance: string;
  school: string;
  photoUrl: string | null;
  onFile: (file: File) => void;
  onAdjust: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const sw = childSwatch(index);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const name = [prenom.trim(), nom.trim().toUpperCase()].filter(Boolean).join(" ");

  function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de reprendre le même fichier ensuite
    if (file) onFile(file);
  }

  return (
    <div className="overflow-hidden rounded-3xl border bg-white shadow-[var(--shadow-soft)]" style={{ borderColor: `${sw.border}88` }}>
      <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white" style={{ backgroundColor: sw.border }}>
        <span className="inline-flex items-center gap-1.5">
          <GraduationCap size={14} /> {t("fam.pub.card.title")} · {school}
        </span>
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px]">{t("fam.pub.card.preview")}</span>
      </div>

      <div className="flex gap-4 p-4">
        <div className="w-24 shrink-0 sm:w-28">
          <button
            type="button"
            onClick={() => (photoUrl ? onAdjust() : galleryRef.current?.click())}
            aria-label={photoUrl ? t("fam.pub.photo.adjust") : t("fam.pub.photo.gallery")}
            className={`group relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl transition-transform active:scale-95 ${photoUrl ? "" : "sa-float border-2 border-dashed"}`}
            style={photoUrl ? { boxShadow: `0 0 0 3px ${sw.border}` } : { borderColor: `${sw.border}99`, backgroundColor: sw.bg, color: sw.text }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={t("fam.pub.photo.alt", { name: name || t("fam.pub.card.namePlaceholder") })} className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs font-semibold">
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                  {name ? childInitials({ nom, prenom }, index) : <UserRound size={18} aria-hidden />}
                </span>
                <Camera size={18} aria-hidden />
                {t("fam.pub.photo.empty")}
              </span>
            )}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <p className={`font-display text-xl font-semibold leading-tight ${name ? "text-ink" : "italic text-ink-muted/70"}`}>{name || t("fam.pub.card.namePlaceholder")}</p>
          {classe && (
            <p className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: sw.bg, color: sw.text }}>
              {classe}
            </p>
          )}
          {dateNaissance && <p className="mt-2 text-sm text-ink-muted">{t("fam.pub.card.born", { date: formatDate(dateNaissance) })}</p>}
          <p className="mt-2 text-xs leading-snug text-ink-muted">{t("fam.pub.photo.hint")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface-muted/50 p-3">
        {photoUrl ? (
          <>
            <button type="button" onClick={onAdjust} className="sa-interactive inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 py-2.5 text-sm font-medium text-ink hover:border-primary/50">
              <Crop size={16} /> {t("fam.pub.photo.adjust")}
            </button>
            <button type="button" onClick={onRemove} className="sa-interactive inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 py-2.5 text-sm font-medium text-danger hover:border-danger/50">
              <Trash2 size={16} /> {t("fam.pub.photo.remove")}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => cameraRef.current?.click()} className="sa-interactive inline-flex items-center justify-center gap-2 rounded-full bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:bg-primary-dark">
              <Camera size={16} /> {t("fam.pub.photo.camera")}
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} className="sa-interactive inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 py-2.5 text-sm font-medium text-ink hover:border-primary/50">
              <ImagePlus size={16} /> {t("fam.pub.photo.gallery")}
            </button>
          </>
        )}
      </div>
      <p className="px-4 pb-3 pt-2 text-center text-[11px] font-medium uppercase tracking-wide text-ink-muted/80">{t("fam.pub.photo.optional")}</p>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} tabIndex={-1} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={picked} tabIndex={-1} />
    </div>
  );
}
