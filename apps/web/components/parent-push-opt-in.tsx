"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui";
import { describePortalError } from "@/lib/portal-api";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push";

type State = "loading" | "on" | "off" | "denied";

/**
 * Activation des alertes push sur CET appareil. Elle demande la permission du navigateur, jamais avant
 * un geste du parent. Sur iPhone et iPad, les alertes n'existent que pour une application ajoutée à
 * l'écran d'accueil : on l'explique au lieu d'afficher un bouton qui ne pourrait pas marcher.
 */
export function ParentPushOptIn({ serverEnabled, onChange }: { serverEnabled: boolean; onChange?: () => void }) {
  const [support, setSupport] = useState<PushSupport>("supported");
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = pushSupport();
    setSupport(s);
    if (s !== "supported") return;
    if (Notification.permission === "denied") return setState("denied");
    setState((await currentSubscription()) ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePush();
      if (result === "denied") setState("denied");
      else if (result === "enabled") setState("on");
      else if (result === "no-key") setError("Les alertes ne sont pas encore disponibles sur ce service. Vous les verrez dans l'application.");
      else setError("Cet appareil ne peut pas recevoir d'alertes pour le moment. Ouvrez l'application installée, ou réessayez plus tard.");
      onChange?.();
    } catch (err) {
      setError(describePortalError(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    await disablePush();
    setState("off");
    setBusy(false);
    onChange?.();
  }

  if (!serverEnabled) {
    return <p className="text-sm text-ink-muted">Les alertes sur téléphone ne sont pas encore activées par l&apos;école. Vos notifications restent visibles ici.</p>;
  }
  if (support === "needs-install") {
    return (
      <div className="flex gap-3 rounded-xl bg-info-soft p-3 text-sm text-info">
        <Smartphone className="mt-0.5 shrink-0" size={18} />
        <p>
          Sur iPhone et iPad, les alertes fonctionnent seulement depuis l&apos;icône de l&apos;application. Dans Safari, touchez « Partager », puis « Sur l&apos;écran d&apos;accueil », ouvrez
          l&apos;application depuis cette icône et revenez ici.
        </p>
      </div>
    );
  }
  if (support === "unsupported") {
    return <p className="text-sm text-ink-muted">Ce navigateur ne sait pas recevoir d&apos;alertes. Vos notifications restent visibles dans cette page.</p>;
  }
  if (state === "denied") {
    return (
      <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
        Les notifications sont bloquées pour ce site dans votre navigateur. Autorisez-les dans les réglages du navigateur, puis revenez ici.
      </p>
    );
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {state === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-success">
            <BellRing size={16} /> Alertes activées sur cet appareil
          </span>
          <Button variant="secondary" onClick={() => void turnOff()} disabled={busy}>
            Désactiver
          </Button>
        </div>
      ) : (
        <Button onClick={() => void turnOn()} disabled={busy || state === "loading"}>
          <BellRing size={16} /> Activer les alertes sur ce téléphone
        </Button>
      )}
      <p className="mt-2 text-xs text-ink-muted">L&apos;alerte donne seulement le prénom de l&apos;enfant. Le détail s&apos;affiche dans l&apos;application, après connexion.</p>
    </div>
  );
}
