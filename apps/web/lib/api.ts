export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Le jeton d'accès ne vit qu'en mémoire (jamais localStorage/cookie non httpOnly) — cohérent avec
// le choix côté API (voir apps/api CLAUDE.md) : seul le refresh_token, httpOnly, survit à un rechargement.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function extractErrorBody(res: Response): Promise<{ message: string; data: unknown }> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const rawMessage = record.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join(", ")
        : typeof rawMessage === "string"
          ? rawMessage
          : `Erreur ${res.status}`;
      return { message, data: body };
    }
  } catch {
    // corps non-JSON, on retombe sur le message générique ci-dessous
  }
  return { message: `Erreur ${res.status}`, data: null };
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string };
  accessToken = data.accessToken;
  return accessToken;
}

// Un 401 sur /auth/login (mauvais mot de passe) ou /auth/refresh (pas de session à renouveler)
// est un échec d'authentification normal, jamais une session qui a expiré en cours de route —
// ne jamais tenter un rafraîchissement ni afficher "Session expirée" pour ces deux routes
// (bug réel observé : un simple mauvais mot de passe affichait "Session expirée", pas le vrai
// message serveur "Identifiant ou mot de passe incorrect").
const AUTH_ENTRY_POINTS = ["/auth/login", "/auth/refresh"];

async function request<T>(path: string, options: RequestInit = {}, allowRetry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 401 && allowRetry && !AUTH_ENTRY_POINTS.includes(path)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, options, false);
    }
    accessToken = null;
    onSessionExpired?.();
    throw new ApiError("Session expirée, veuillez vous reconnecter.", 401);
  }

  if (!res.ok) {
    const { message, data } = await extractErrorBody(res);
    throw new ApiError(message, res.status, data);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  // Corps `FormData` brut, jamais JSON.stringify — `request()` détecte déjà FormData pour ne pas
  // poser de Content-Type (le navigateur doit fixer lui-même la boundary multipart).
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
