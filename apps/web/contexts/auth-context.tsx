"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, setAccessToken, setSessionExpiredHandler } from "@/lib/api";
import type { CurrentUser, LoginResponse } from "@/lib/types";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, motDePasse: string) => Promise<{ doitChangerMotDePasse: boolean }>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadCurrentUser = useCallback(async () => {
    const me = await api.get<CurrentUser>("/auth/me");
    setUser(me);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      router.push("/login");
    });

    // Le jeton d'accès ne vit qu'en mémoire : au chargement de la page, on tente un rafraîchissement
    // silencieux via le cookie httpOnly pour restaurer la session sans redemander le mot de passe.
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { accessToken: string };
          setAccessToken(data.accessToken);
          await loadCurrentUser();
        }
      } catch {
        // pas de session à restaurer, l'utilisateur devra se connecter
      } finally {
        setLoading(false);
      }
    })();

    return () => setSessionExpiredHandler(null);
  }, [loadCurrentUser, router]);

  const login = useCallback(
    async (email: string, motDePasse: string) => {
      const res = await api.post<LoginResponse>("/auth/login", { email, motDePasse });
      setAccessToken(res.accessToken);
      await loadCurrentUser();
      return { doitChangerMotDePasse: res.user.doitChangerMotDePasse };
    },
    [loadCurrentUser],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // on efface la session locale même si l'appel serveur échoue (déjà expiré, réseau, etc.)
    }
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const hasPermission = useCallback((code: string) => user?.permissions.includes(code) ?? false, [user]);

  const value = useMemo(
    () => ({ user, loading, login, logout, hasPermission, refreshUser: loadCurrentUser }),
    [user, loading, login, logout, hasPermission, loadCurrentUser],
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
