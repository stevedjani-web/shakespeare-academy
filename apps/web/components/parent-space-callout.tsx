"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Invitation imprimée sur les reçus : un QR code et une adresse qui mènent à l'Espace parents. Le reçu est le seul papier
 * que la famille garde de l'école : c'est là qu'on lui donne envie de se connecter pour suivre la scolarité de son
 * enfant (emploi du temps, absences, notes, bulletins, paiements). L'adresse vient du navigateur, jamais d'un nom de
 * domaine écrit dans le code ; le QR ne contient que l'adresse de connexion, aucune donnée de l'élève.
 */
export function ParentSpaceCallout() {
  const { t } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  const [address, setAddress] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/parents/connexion`;
    setAddress(`${window.location.host}/parents/connexion`);
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#2f2b78", light: "#ffffff" } })
      .then(setQr)
      .catch(() => undefined);
  }, []);

  return (
    <section
      aria-label={t("fin.receipt.parent.title")}
      className="mt-6 break-inside-avoid overflow-hidden rounded-2xl border border-primary/25 bg-primary-soft/60 print:border-primary print:bg-white"
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Smartphone size={13} /> {t("fin.receipt.parent.kicker")}
          </p>
          <p className="mt-1 font-display text-base font-semibold leading-snug text-ink">{t("fin.receipt.parent.title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t("fin.receipt.parent.text")}</p>
          <p className="mt-2 break-all rounded-md bg-white px-2 py-1 font-mono text-[11px] font-medium text-primary print:border print:border-primary/30">{address}</p>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client, jamais une image next/image
          <img src={qr} alt={t("fin.receipt.parent.qrAlt")} className="h-24 w-24 shrink-0 rounded-lg border border-primary/20 bg-white p-1" />
        )}
      </div>
      <p className="border-t border-primary/15 bg-white/60 px-4 py-2 text-[11px] text-ink-muted print:bg-white">{t("fin.receipt.parent.help")}</p>
    </section>
  );
}
