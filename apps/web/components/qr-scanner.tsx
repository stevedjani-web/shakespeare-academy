"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";

/** Le jeton d'un QR de pointage : soit l'adresse complète (?c=...), soit le jeton seul. */
export function extractCode(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.searchParams.get("c");
  } catch {
    return /^[A-Za-z0-9_-]{8,}$/.test(value) ? value : null;
  }
}

/**
 * Lit un QR code avec la caméra de l'appareil. La caméra n'est ouverte que pendant le scan et
 * toujours coupée ensuite ; aucune image n'est conservée ni envoyée.
 */
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const canvas = document.createElement("canvas");

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("tt.scanner.noBrowserCamera");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setError("tt.scanner.cameraDenied");
        return;
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      timer = setInterval(() => {
        const v = video.current;
        if (!v || v.videoWidth === 0) return;
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(v, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (!found) return;
        const code = extractCode(found.data);
        if (code) {
          onCode(code);
        } else {
          setUnreadable(true);
        }
      }, 250);
    }
    void start();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onCode est stable côté appelant : on ne relance pas la caméra à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <Camera size={16} /> {t("tt.scanner.frame")}
        </p>
        <Button variant="ghost" onClick={onClose} aria-label={t("tt.scanner.closeCamera")}>
          <X size={16} />
        </Button>
      </div>
      {error ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{t(error)}</p>
      ) : (
        <video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" />
      )}
      {unreadable && <p className="text-sm text-warning">{t("tt.scanner.notCheckinQr")}</p>}
    </div>
  );
}
