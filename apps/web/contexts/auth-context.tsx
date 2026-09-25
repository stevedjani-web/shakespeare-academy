"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, api, ApiError, setAccessToken, setSessionExpiredHandler } from "@/lib/api";
import { isOnline, startConnectivityWatch } from "@/lib/connectivity";
import { cachePut, clearCache, setCacheOwner } from "@/lib/offline-cache";
import { processOutbox, setOutboxUser } from "@/lib/outbox";
import { warmOfflineCache } from "@/lib/offline-warmup";
import type { CurrentUser, LoginResponse } from "@/lib/types";
import { applyAccountLanguage } from "@/lib/i18n/store";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  /** Session ouverte sans Internet (données copiées sur l'appareil, jeton à renouveler au retour du réseau). */
  offlineSession: boolean;
  login: (email: string, motDePasse: string) => Promise<{ doitChangerMotDePasse: boolean }>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function tryRefresh(): Promise<"ok" | "expired" | "network"> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return "ok";
    }
    return "expired";
  } catch {
    return "network";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);
  const router = useRouter();
  const offlineRef = useRef(false);

  const setOfflineMode = useCallback((value: boolean) => {
    offlineRef.current = value;
    setOfflineSession(value);
  }, []);

  const loadCurrentUser = useCallback(async () => {
    const me = await api.get<CurrentUser>("/auth/me");
    await setCacheOwner(me.id);
    await cachePut("/auth/me", me);
    setOutboxUser({ id: me.id, name: `${me.prenom} ${me.nom}` });
    setUser(me);
    // La langue choisie sur le compte prime sur celle de l'appareil, et suit l'utilisateur d'un appareil à l'autre.
    applyAccountLanguage(me.langue);
    return me;
  }, []);

  const afterOnlineSession = useCallback((me: CurrentUser) => {
    void processOutbox();
    // Copie des données en arrière-plan, sans gêner l'écran (réseau lent, priorité à l'utilisateur).
    setTimeout(() => void warmOfflineCache({ permissions: me.permissions }), 2500);
  }, []);

  useEffect(() => {
    startConnectivityWatch(API_URL);
    setSessionExpiredHandler(() => {
      setUser(null);
      setOutboxUser(null);
      router.push("/login");
    });

    // Le jeton d'accès ne vit qu'en mémoire : au chargement de la page, on tente un rafraîchissement
    // silencieux via le cookie httpOnly pour restaurer la session sans redemander le mot de passe.
    // Sans réseau, on rouvre la session à partir de la copie locale du dernier utilisateur connecté
    // (lecture et saisies en file d'attente seulement) ; le jeton est renouvelé au retour d'Internet.
    (async () => {
      try {
        const outcome = await tryRefresh();
        if (outcome === "ok") {
          const me = await loadCurrentUser();
          afterOnlineSession(me);
        } else if (outcome === "network") {
          try {
            await loadCurrentUser();
            setOfflineMode(true);
          } catch {
            // aucune copie locale : il faudra se connecter
          }
        }
      } catch {
        // pas de session à restaurer, l'utilisateur devra se connecter
      } finally {
        setLoading(false);
      }
    })();

    const onBackOnline = async () => {
      if (offlineRef.current) {
        const outcome = await tryRefresh();
        if (outcome === "ok") {
          setOfflineMode(false);
          try {
            const me = await loadCurrentUser();
            afterOnlineSession(me);
          } catch {
            // le prochain appel réessaiera
          }
        } else if (outcome === "expired") {
          // Session périmée pendant l'absence de réseau : reconnexion nécessaire (les saisies en
          // attente sont conservées et partiront après la connexion).
          setOfflineMode(false);
          setUser(null);
          router.push("/login");
        }
      } else {
        void processOutbox();
      }
    };
    window.addEventListener("sa-online", onBackOnline);
    const timer = setInterval(() => {
      if (isOnline()) void processOutbox();
    }, 45000);

    return () => {
      setSessionExpiredHandler(null);
      window.removeEventListener("sa-online", onBackOnline);
      clearInterval(timer);
    };
  }, [afterOnlineSession, loadCurrentUser, router, setOfflineMode]);

  const login = useCallback(
    async (email: string, motDePasse: string) => {
      const res = await api.post<LoginResponse>("/auth/login", { email, motDePasse });
      setAccessToken(res.accessToken);
      const me = await loadCurrentUser();
      setOfflineMode(false);
      afterOnlineSession(me);
      return { doitChangerMotDePasse: res.user.doitChangerMotDePasse };
    },
    [afterOnlineSession, loadCurrentUser, setOfflineMode],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // on efface la session locale même si l'appel serveur échoue (déjà expiré, réseau, etc.)
    }
    setAccessToken(null);
    setUser(null);
    setOutboxUser(null);
    setOfflineMode(false);
    // Les données copiées sur l'appareil disparaissent avec la session ; les saisies en attente restent.
    await clearCache();
    router.push("/login");
  }, [router, setOfflineMode]);

  const hasPermission = useCallback((code: string) => user?.permissions.includes(code) ?? false, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      offlineSession,
      login,
      logout,
      hasPermission,
      refreshUser: async () => {
        await loadCurrentUser();
      },
    }),
    [user, loading, offlineSession, login, logout, hasPermission, loadCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return ctx;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
