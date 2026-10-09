"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import { MAX_ZOOM, MIN_ZOOM, PHOTO_FRAME_RATIO, PHOTO_OUT_HEIGHT, PHOTO_OUT_WIDTH, clampCrop, coverScale, cropRect } from "@/lib/family-form";

/**
 * Cadrage d'une photo d'identité en portrait 3:4, au doigt ou à la souris : glisser pour déplacer, pincer (ou molette, ou
 * curseur) pour zoomer, ovale de repère pour placer le visage. Le résultat est une image JPEG déjà recadrée et réduite
 * (quelques dizaines de Ko) : c'est elle qui est envoyée, jamais l'original de plusieurs Mo.
 */
export function PhotoCropper({ file, onCancel, onDone, onUnreadable }: { file: Blob; onCancel: () => void; onDone: (cropped: Blob) => void; onUnreadable: () => void }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState({ w: 270, h: 360 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDistance = useRef<number | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Adresse locale de l'image, libérée à la fermeture.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Taille du cadre : tient dans l'écran (téléphone étroit ou court) sans jamais dépasser 300 px de large.
  useEffect(() => {
    function measure() {
      const width = Math.max(200, Math.min(300, window.innerWidth - 56, (window.innerHeight - 300) * PHOTO_FRAME_RATIO));
      setFrame({ w: Math.round(width), h: Math.round(width / PHOTO_FRAME_RATIO) });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Échap ferme ; le défilement de la page derrière est bloqué ; le bouton principal prend le focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onCancel]);

  useEffect(() => {
    if (natural) confirmRef.current?.focus({ preventScroll: true });
  }, [natural]);

  const input = useCallback(
    (z: number, x: number, y: number) => (natural ? { width: natural.w, height: natural.h, frameWidth: frame.w, frameHeight: frame.h, zoom: z, x, y } : null),
    [natural, frame],
  );

  const apply = useCallback(
    (z: number, x: number, y: number) => {
      const c = input(z, x, y);
      if (!c) return;
      const clamped = clampCrop(c);
      setZoom(clamped.zoom);
      setPos({ x: clamped.x, y: clamped.y });
    },
    [input],
  );

  // Le cadre change de taille (rotation du téléphone) : on rétablit un cadrage valide.
  useEffect(() => {
    apply(zoom, pos.x, pos.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, natural]);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastDistance.current = null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const known = pointers.current.get(e.pointerId);
    if (!known) return;
    if (pointers.current.size === 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDistance.current) apply(zoom * (distance / lastDistance.current), pos.x, pos.y);
      lastDistance.current = distance;
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    apply(zoom, pos.x + (e.clientX - known.x), pos.y + (e.clientY - known.y));
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    lastDistance.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    apply(zoom * (e.deltaY < 0 ? 1.08 : 0.92), pos.x, pos.y);
  }

  async function confirm() {
    const img = imgRef.current;
    const c = input(zoom, pos.x, pos.y);
    if (!img || !c) return;
    setBusy(true);
    try {
      const { sx, sy, sw, sh } = cropRect(c);
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_OUT_WIDTH;
      canvas.height = PHOTO_OUT_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PHOTO_OUT_WIDTH, PHOTO_OUT_HEIGHT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
      if (!blob) throw new Error("blob");
      onDone(blob);
    } catch {
      onUnreadable();
    } finally {
      setBusy(false);
    }
  }

  const scale = natural ? coverScale({ width: natural.w, height: natural.h, frameWidth: frame.w, frameHeight: frame.h }) * zoom : 1;

  return (
    <div className="sa-fade fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("fam.pub.crop.dialog")}>
      <div className="sa-sheet-up flex max-h-[100dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)] sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{t("fam.pub.crop.title")}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{t("fam.pub.crop.hint")}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label={t("fam.pub.crop.cancel")} className="rounded-full p-2 text-ink-muted hover:bg-surface-muted">
            <X size={20} />
          </button>
        </div>

        <div className="flex justify-center">
          <div
            className="relative touch-none select-none overflow-hidden rounded-2xl bg-ink/90 shadow-inner"
            style={{ width: frame.w, height: frame.h, cursor: natural ? "grab" : "default" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onWheel={onWheel}
          >
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                onError={onUnreadable}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={natural ? { width: natural.w * scale, height: natural.h * scale, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` } : { opacity: 0 }}
              />
            )}
            {!natural && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Spinner />
              </div>
            )}
            {/* Repère : l'ovale du visage, et une ombre légère autour pour voir ce qui sera gardé. */}
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 133.33" preserveAspectRatio="none">
              <defs>
                <mask id="face-mask">
                  <rect width="100" height="133.33" fill="white" />
                  <ellipse cx="50" cy="58" rx="27" ry="35" fill="black" />
                </mask>
              </defs>
              <rect width="100" height="133.33" fill="rgba(0,0,0,0.38)" mask="url(#face-mask)" />
              <ellipse cx="50" cy="58" rx="27" ry="35" fill="none" stroke="white" strokeWidth="0.9" strokeDasharray="3 2.2" />
            </svg>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => apply(zoom / 1.2, pos.x, pos.y)} aria-label={t("fam.pub.crop.zoom")} className="rounded-full border border-border p-2 text-ink hover:bg-surface-muted">
            <Minus size={16} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label={t("fam.pub.crop.zoom")}
            onChange={(e) => apply(Number(e.target.value), pos.x, pos.y)}
            className="h-2 flex-1 accent-primary"
          />
          <button type="button" onClick={() => apply(zoom * 1.2, pos.x, pos.y)} aria-label={t("fam.pub.crop.zoom")} className="rounded-full border border-border p-2 text-ink hover:bg-surface-muted">
            <Plus size={16} />
          </button>
          <button type="button" onClick={() => apply(1, 0, 0)} aria-label={t("fam.pub.crop.reset")} title={t("fam.pub.crop.reset")} className="rounded-full border border-border p-2 text-ink hover:bg-surface-muted">
            <RotateCcw size={16} />
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1 py-3" onClick={onCancel}>
            {t("fam.pub.crop.cancel")}
          </Button>
          <button
            ref={confirmRef}
            type="button"
            disabled={!natural || busy}
            onClick={() => void confirm()}
            className="sa-interactive inline-flex flex-[2] items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:bg-primary-dark disabled:bg-primary/40"
          >
            {busy && <Spinner />} {busy ? t("fam.pub.crop.working") : t("fam.pub.crop.use")}
          </button>
        </div>
      </div>
    </div>
  );
}
