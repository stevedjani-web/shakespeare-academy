"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CloudOff, Download, RefreshCw, X } from "lucide-react";
import { checkConnectivityNow, useOnline } from "@/lib/connectivity";
import { getLastOnlineAt } from "@/lib/offline-cache";
import { processOutbox, useOutbox } from "@/lib/outbox";
import { getWarmupProgress, type WarmupProgress } from "@/lib/offline-warmup";
import { promptInstall, useInstallState } from "@/lib/pwa-install";
import { InstallAppButton } from "@/components/install-app-button";

function useWarmup(): WarmupProgress {
  const [state, setState] = useState<WarmupProgress>(getWarmupProgress());
  useEffect(() => {
    const update = () => setState({ ...getWarmupProgress() });
    window.addEventListener("sa-warmup", update);
    return () => window.removeEventListener("sa-warmup", update);
  }, []);
  return state;
}

function formatWhen(ts: number | null): string {
  if (!ts) return "inconnue";
  return new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Bandeau d'état : hors ligne, saisies en attente ou en échec, préparation du hors ligne, installation. */
export function OfflineStatus() {
  const online = useOnline();
  const { pending, failed } = useOutbox();
  const warm = useWarmup();
  const install = useInstallState();
  const [lastOnline, setLastOnline] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(true);

  useEffect(() => {
    if (!online) void getLastOnlineAt().then(setLastOnline);
  }, [online]);
  useEffect(() => {
    setInstallDismissed(localStorage.getItem("sa.installDismissed") === "1");
  }, []);

  const bars: React.ReactNode[] = [];

  if (!online) {
    bars.push(
      <div key="offline" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-sm text-white">
        <CloudOff size={16} className="shrink-0" />
        <span className="flex-1">
          <strong>Hors ligne.</strong> Données à jour au {formatWhen(lastOnline)}. Vous pouvez consulter, saisir et encaisser :
          tout sera envoyé au retour d&apos;Internet.
          {pending > 0 && <> {pending} saisie(s) en attente.</>}
        </span>
        <button
          onClick={async () => {
            setChecking(true);
            await checkConnectivityNow();
            setChecking(false);
          }}
          className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
        >
          {checking ? "Test…" : "Réessayer"}
        </button>
      </div>,
    );
  } else if (failed > 0) {
    bars.push(
      <Link key="failed" href="/hors-ligne" className="flex items-center gap-2 bg-danger px-4 py-2 text-sm text-white">
        <AlertTriangle size={16} className="shrink-0" />
        <span className="flex-1">
          <strong>{failed} saisie(s) n&apos;ont pas pu être enregistrées.</strong> Touchez ici pour les vérifier.
        </span>
      </Link>,
    );
  } else if (pending > 0) {
    bars.push(
      <div key="pending" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-info px-4 py-2 text-sm text-white">
        <RefreshCw size={16} className="shrink-0 animate-spin" />
        <span className="flex-1">{pending} saisie(s) en cours d&apos;envoi au serveur…</span>
        <button onClick={() => void processOutbox()} className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
          Synchroniser maintenant
        </button>
        <Link href="/hors-ligne" className="text-xs underline">
          Détail
        </Link>
      </div>,
    );
  }

  if (online && warm.running) {
    bars.push(
      <div key="warm" className="bg-primary-soft px-4 py-1.5 text-xs text-primary">
        Préparation du mode hors ligne : {Math.min(warm.done, warm.total)}/{warm.total}
      </div>,
    );
  }

  if (online && !install.standalone && !installDismissed && (install.canPrompt || install.ios)) {
    bars.push(
      <div key="install" className="flex flex-wrap items-center gap-3 border-b border-border bg-accent-soft px-4 py-2 text-sm text-ink">
        <Download size={16} className="shrink-0 text-accent-dark" />
        <span className="flex-1">Installez l&apos;application sur votre téléphone : accès direct et utilisable sans Internet.</span>
        {install.canPrompt ? (
          <button onClick={() => void promptInstall()} className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark">
            Installer
          </button>
        ) : (
          <InstallAppButton className="w-40" />
        )}
        <button
          aria-label="Masquer"
          onClick={() => {
            localStorage.setItem("sa.installDismissed", "1");
            setInstallDismissed(true);
          }}
          className="rounded-lg p-1 text-ink-muted hover:bg-black/5"
        >
          <X size={16} />
        </button>
      </div>,
    );
  }

  if (bars.length === 0) return null;
  return <div className="sticky top-0 z-40 print:hidden">{bars}</div>;
}
