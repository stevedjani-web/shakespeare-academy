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
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locales";

function useWarmup(): WarmupProgress {
  const [state, setState] = useState<WarmupProgress>(getWarmupProgress());
  useEffect(() => {
    const update = () => setState({ ...getWarmupProgress() });
    window.addEventListener("sa-warmup", update);
    return () => window.removeEventListener("sa-warmup", update);
  }, []);
  return state;
}

function formatWhen(ts: number | null, locale: Locale, unknown: string): string {
  if (!ts) return unknown;
  return new Date(ts).toLocaleString(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Bandeau d'état : hors ligne, saisies en attente ou en échec, préparation du hors ligne, installation. */
export function OfflineStatus() {
  const { t, locale } = useI18n();
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
          <strong>{t("offline.offline")}</strong> {t("offline.dataAsOf", { when: formatWhen(lastOnline, locale, t("offline.unknown")) })}
          {pending > 0 && <> {t("offline.pendingEntries", { count: pending })}</>}
        </span>
        <button
          onClick={async () => {
            setChecking(true);
            await checkConnectivityNow();
            setChecking(false);
          }}
          className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
        >
          {checking ? t("offline.testing") : t("offline.retry")}
        </button>
      </div>,
    );
  } else if (failed > 0) {
    bars.push(
      <Link key="failed" href="/hors-ligne" className="flex items-center gap-2 bg-danger px-4 py-2 text-sm text-white">
        <AlertTriangle size={16} className="shrink-0" />
        <span className="flex-1">
          <strong>{t("offline.failed", { count: failed })}</strong> {t("offline.failedHint")}
        </span>
      </Link>,
    );
  } else if (pending > 0) {
    bars.push(
      <div key="pending" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-info px-4 py-2 text-sm text-white">
        <RefreshCw size={16} className="shrink-0 animate-spin" />
        <span className="flex-1">{t("offline.sending", { count: pending })}</span>
        <button onClick={() => void processOutbox()} className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
          {t("offline.syncNow")}
        </button>
        <Link href="/hors-ligne" className="text-xs underline">
          {t("offline.detail")}
        </Link>
      </div>,
    );
  }

  if (online && warm.running) {
    bars.push(
      <div key="warm" className="bg-primary-soft px-4 py-1.5 text-xs text-primary">
        {t("offline.warmup", { done: Math.min(warm.done, warm.total), total: warm.total })}
      </div>,
    );
  }

  if (online && !install.standalone && !installDismissed && (install.canPrompt || install.ios)) {
    bars.push(
      <div key="install" className="flex flex-wrap items-center gap-3 border-b border-border bg-accent-soft px-4 py-2 text-sm text-ink">
        <Download size={16} className="shrink-0 text-accent-dark" />
        <span className="flex-1">{t("install.banner")}</span>
        {install.canPrompt ? (
          <button onClick={() => void promptInstall()} className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark">
            {t("install.action")}
          </button>
        ) : (
          <InstallAppButton className="w-40" />
        )}
        <button
          aria-label={t("common.hide")}
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
