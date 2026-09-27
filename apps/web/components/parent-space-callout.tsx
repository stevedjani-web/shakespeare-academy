"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Invitation imprimée sur les reçus : un QR code et une adresse qui mènent à l'Espace parents. Le reçu est le seul papier
 * que la famille garde de l'école : c'est là qu'on lui donne envie de se connecter pour suivre la vie scolaire de son
 * enfant (emploi du temps, absences, notes, bulletins, paiements). L'adresse vient du navigateur, jamais d'un nom de
 * domaine écrit dans le code ; le QR ne contient que l'adresse de connexion, aucune donnée de l'élève. L'adresse tient
 * toujours sur une seule ligne (elle se copie ou se tape d'un trait), sous le texte et le QR.
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
      className="mt-5 break-inside-avoid print:mt-4 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary-soft to-white print:border-primary print:bg-white"
    >
      <div className="flex items-center gap-3 px-4 pb-2 pt-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Smartphone size={13} /> {t("fin.receipt.parent.kicker")}
          </p>
          <p className="mt-1 font-display text-[15px] font-semibold leading-snug text-ink">{t("fin.receipt.parent.title")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{t("fin.receipt.parent.text")}</p>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL générée côté client, jamais une image next/image
          <img src={qr} alt={t("fin.receipt.parent.qrAlt")} className="h-[88px] w-[88px] shrink-0 rounded-lg border border-primary/20 bg-white p-1 print:h-[84px] print:w-[84px]" />
        )}
      </div>
      <p className="mx-4 mb-3 whitespace-nowrap rounded-md bg-white px-2 py-1 text-center font-mono text-[10.5px] font-semibold text-primary print:border print:border-primary/30 print:text-[12px] sm:text-[11px]">
        {address}
      </p>
      <p className="border-t border-primary/15 bg-white/70 px-4 py-2 text-[10px] leading-snug text-ink-muted print:bg-white">{t("fin.receipt.parent.help")}</p>
    </section>
  );
}
