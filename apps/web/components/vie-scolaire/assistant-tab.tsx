"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/store";
import type { MessageKey } from "@/lib/i18n";
import { Badge, Button, Card, ErrorMessage, Field, Input, SuccessMessage } from "@/components/ui";
import { describeError } from "./shared";

interface AssistantSettings {
  actif: boolean;
  plafondMensuelCentimes: number;
  faq: string | null;
  configure: boolean;
  modele: string;
  utilisationMois: { appels: number; coutMicroUsd: number };
  etat: { raison: string | null; enPause: boolean };
}

const PAUSE_REASON: Record<string, MessageKey> = {
  CREDIT: "acd.ai.reason.CREDIT",
  AUTH: "acd.ai.reason.AUTH",
  LIMITE: "acd.ai.reason.LIMITE",
};

const TEXTAREA =
  "min-h-40 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none";

/** Dollars affichés à partir de millionièmes de dollar (affichage seulement, le comptage reste en entiers côté serveur). */
function dollars(microUsd: number): string {
  return (microUsd / 1_000_000).toLocaleString(INTL_LOCALE[getLocale()], { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

/**
 * Lot 22 : réglages de l'assistant de rédaction de la messagerie. Éteint par défaut. La Direction l'active, fixe le plafond
 * mensuel (en dollars) et rédige la FAQ de l'école : ce que l'assistant peut dire qui ne vient pas de la base.
 */
export function AssistantTab() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [cap, setCap] = useState("");
  const [faq, setFaq] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((s: AssistantSettings) => {
    setSettings(s);
    setCap(String(s.plafondMensuelCentimes / 100));
    setFaq(s.faq ?? "");
  }, []);

  useEffect(() => {
    api
      .get<AssistantSettings>("/messaging/assistant/settings")
      .then(apply)
      .catch((err) => setError(describeError(err)));
  }, [apply]);

  async function save(patch: { actif?: boolean; plafondMensuelCentimes?: number; faq?: string | null }) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await api.patch<AssistantSettings>("/messaging/assistant/settings", patch));
      setNotice(t("acd.ai.set.saved"));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    const dollarsValue = Number(cap.replace(",", "."));
    if (!Number.isFinite(dollarsValue) || dollarsValue < 0) {
      setError(t("acd.ai.set.capInvalid"));
      return;
    }
    void save({ plafondMensuelCentimes: Math.round(dollarsValue * 100), faq: faq.trim() === "" ? null : faq });
  }

  if (!settings) return <ErrorMessage>{error}</ErrorMessage>;

  const used = settings.utilisationMois.coutMicroUsd;
  const capMicro = settings.plafondMensuelCentimes * 10_000;
  const pauseKey = settings.etat.enPause && settings.etat.raison ? PAUSE_REASON[settings.etat.raison] : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">{t("acd.ai.set.title")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("acd.ai.set.intro")}</p>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && <SuccessMessage>{notice}</SuccessMessage>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge color={settings.actif ? "green" : "gray"}>{settings.actif ? t("acd.ai.set.on") : t("acd.ai.set.off")}</Badge>
          <Button variant={settings.actif ? "secondary" : "primary"} disabled={busy} onClick={() => void save({ actif: !settings.actif })}>
            {settings.actif ? t("acd.ai.set.turnOff") : t("acd.ai.set.turnOn")}
          </Button>
          <Badge color={settings.configure ? "green" : "orange"}>{settings.configure ? t("acd.ai.set.keyOk") : t("acd.ai.set.keyMissing")}</Badge>
        </div>
        {!settings.configure && <p className="mt-2 text-sm text-warning">{t("acd.ai.set.keyHelp")}</p>}
        {pauseKey && <p className="mt-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">{t("acd.ai.set.paused")} {t(pauseKey)}</p>}
        <p className="mt-3 text-xs text-ink-muted">{t("acd.ai.set.model", { model: settings.modele })}</p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink">{t("acd.ai.set.usageTitle")}</h3>
        <p className="mt-1 text-sm text-ink">
          {t("acd.ai.set.usage", { calls: settings.utilisationMois.appels, cost: dollars(used), cap: dollars(capMicro) })}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className={`h-full ${used >= capMicro ? "bg-danger" : "bg-primary"}`}
            style={{ width: `${capMicro > 0 ? Math.min(100, Math.round((used / capMicro) * 100)) : 100}%` }}
          />
        </div>
      </Card>

      <Card>
        <form onSubmit={saveDetails} className="space-y-3">
          <Field label={t("acd.ai.set.capLabel")}>
            <Input value={cap} inputMode="decimal" onChange={(e) => setCap(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-muted">{t("acd.ai.set.capHelp")}</p>
          <Field label={t("acd.ai.set.faqLabel")}>
            <textarea className={TEXTAREA} maxLength={4000} value={faq} placeholder={t("acd.ai.set.faqPlaceholder")} onChange={(e) => setFaq(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-muted">{t("acd.ai.set.faqHelp")}</p>
          <Button type="submit" disabled={busy}>
            {t("acd.ai.set.save")}
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink">{t("acd.ai.set.privacyTitle")}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>{t("acd.ai.set.privacy1")}</li>
          <li>{t("acd.ai.set.privacy2")}</li>
          <li>{t("acd.ai.set.privacy3")}</li>
        </ul>
      </Card>
    </div>
  );
}
