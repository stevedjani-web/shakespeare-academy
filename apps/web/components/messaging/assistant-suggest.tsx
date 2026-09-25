"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { Button, ErrorMessage, Input } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

interface Status {
  actif: boolean;
  disponible: boolean;
  raison?: string;
}

type Suggestion =
  | { disponible: true; reponse: string; incertain: boolean; raisons: string[]; sources: string[] }
  | { disponible: false; raison: string; message: string };

// Ce que la Direction voit quand l'assistant est en panne durable ; le personnel ordinaire ne voit que « indisponible ».
const STATUS_REASON: Record<string, MessageKey> = {
  CREDIT: "acd.ai.reason.CREDIT",
  AUTH: "acd.ai.reason.AUTH",
  LIMITE: "acd.ai.reason.LIMITE",
  PLAFOND: "acd.ai.reason.PLAFOND",
  NON_CONFIGURE: "acd.ai.reason.NON_CONFIGURE",
};

/**
 * Lot 22 : « Proposer une réponse » (mode brouillon). Le texte proposé est placé dans la zone de réponse : rien n'est
 * envoyé au parent sans que la personne l'ait relu et envoyé elle-même. Si l'assistant est éteint, on ne montre rien ;
 * s'il est en panne (crédit épuisé, clé, plafond, saturation), une phrase l'annonce et la réponse à la main reste
 * possible, exactement comme avant.
 */
export function AssistantSuggest({
  threadId,
  currentText,
  onUse,
}: {
  threadId: string;
  currentText: string;
  onUse: (text: string) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [showInstruction, setShowInstruction] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Status>("/messaging/assistant/status")
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [threadId]);

  if (!status || !status.actif) return null;

  if (!status.disponible) {
    const key = status.raison ? STATUS_REASON[status.raison] : undefined;
    return (
      <p className="rounded-xl bg-surface-muted p-3 text-xs text-ink-muted">
        <Sparkles size={13} className="mr-1 inline" />
        {t("acd.ai.unavailable")}
        {key && <span className="mt-1 block">{t(key)}</span>}
      </p>
    );
  }

  async function suggest() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<Suggestion>(
        `/messaging/assistant/threads/${threadId}/suggest-reply`,
        instruction.trim() ? { consigne: instruction.trim() } : {},
      );
      setResult(res);
      if (res.disponible) {
        if (currentText.trim() && !window.confirm(t("acd.ai.replaceConfirm"))) return;
        onUse(res.reponse);
      } else {
        // Une panne durable est peut-être apparue : on relit l'état pour ne plus proposer le bouton pour rien.
        void api
          .get<Status>("/messaging/assistant/status")
          .then(setStatus)
          .catch(() => undefined);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-muted/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void suggest()} disabled={busy}>
          <Sparkles size={16} /> {busy ? t("acd.ai.working") : t("acd.ai.button")}
        </Button>
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setShowInstruction((v) => !v)}
        >
          {t("acd.ai.instructionToggle")}
        </button>
      </div>
      {showInstruction && (
        <Input
          value={instruction}
          maxLength={400}
          placeholder={t("acd.ai.instructionPlaceholder")}
          onChange={(e) => setInstruction(e.target.value)}
        />
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {result && !result.disponible && <p className="text-sm text-ink-muted">{result.message}</p>}
      {result && result.disponible && (
        <div className="space-y-2 text-xs">
          <p className="text-ink-muted">{t("acd.ai.draftNotice")}</p>
          {result.incertain && (
            <div className="rounded-lg bg-warning-soft p-2 text-warning">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} /> {result.raisons.length > 0 ? t("acd.ai.check") : t("acd.ai.checkGeneric")}
              </p>
              {result.raisons.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {result.raisons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result.sources.length > 0 && <p className="text-ink-muted">{t("acd.ai.sources", { sources: result.sources.join(", ") })}</p>}
        </div>
      )}
    </div>
  );
}
