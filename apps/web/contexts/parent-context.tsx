"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { portalApi, setPortalToken, tryPortalRefresh } from "@/lib/portal-api";
import { disablePush } from "@/lib/push";
import { applyAccountLanguage, getLocale } from "@/lib/i18n/store";
import { isLocale } from "@/lib/i18n/locales";

export interface ParentIdentity {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  /** Langue choisie (« fr » ou « en »), vide tant que le parent n'a pas choisi. */
  langue?: string | null;
}

interface SessionResponse {
  accessToken: string;
  parent: ParentIdentity;
}

interface ParentContextValue {
  parent: ParentIdentity | null;
  loading: boolean;
  login: (telephone: string, motDePasse: string) => Promise<void>;
  activate: (input: { telephone: string; code: string; motDePasse: string; versionPolitique: string }) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Un parent qui n'a jamais choisi de langue garde celle de son appareil, et on l'enregistre sur son compte : les
 * alertes envoyées à son téléphone et les notifications suivent alors la même langue que l'écran.
 */
function rememberDeviceLanguage(langue: string | null | undefined): void {
  if (isLocale(langue)) return;
  void portalApi.patch("/portal/language", { langue: getLocale() }).catch(() => undefined);
}

const ParentContext = createContext<ParentContextValue | null>(null);

/** Session du responsable : indépendante de celle du personnel (autre jeton, autre cookie). */
export function ParentProvider({ children }: { children: React.ReactNode }) {
  const [parent, setParent] = useState<ParentIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  // Restauration silencieuse de la session avec le cookie de renouvellement.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (await tryPortalRefresh()) {
        try {
          const me = await portalApi.get<{ responsable: Omit<ParentIdentity, "id">; langue?: string | null }>("/portal/me");
          if (alive) {
            setParent({ id: "", ...me.responsable, langue: me.langue });
            applyAccountLanguage(me.langue);
            rememberDeviceLanguage(me.langue);
          }
        } catch {
          // pas de session à restaurer
        }
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const open = useCallback((res: SessionResponse) => {
    setPortalToken(res.accessToken);
    setParent(res.parent);
    applyAccountLanguage(res.parent.langue);
    rememberDeviceLanguage(res.parent.langue);
  }, []);

  const login = useCallback(
    async (telephone: string, motDePasse: string) => {
      open(await portalApi.post<SessionResponse>("/portal/login", { telephone, motDePasse }));
    },
    [open],
  );

  const activate = useCallback(
    async (input: { telephone: string; code: string; motDePasse: string; versionPolitique: string }) => {
      open(await portalApi.post<SessionResponse>("/portal/activate", { ...input, consentement: true }));
    },
    [open],
  );

  const logout = useCallback(async () => {
    try {
      // Cet appareil ne doit plus recevoir les alertes de ce parent une fois déconnecté (téléphone partagé).
      await disablePush();
      await portalApi.post("/portal/logout");
    } finally {
      setPortalToken(null);
      setParent(null);
    }
  }, []);

  const value = useMemo(() => ({ parent, loading, login, activate, logout }), [parent, loading, login, activate, logout]);
  return <ParentContext.Provider value={value}>{children}</ParentContext.Provider>;
}

export function useParent(): ParentContextValue {
  const ctx = useContext(ParentContext);
  if (!ctx) throw new Error("useParent doit être utilisé dans <ParentProvider>.");
  return ctx;
}
