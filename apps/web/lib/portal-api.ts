import { API_URL, ApiError } from "@/lib/api";

// Client de l'espace parents. Volontairement distinct de celui du personnel : autre jeton (en mémoire
// seulement), autre cookie de renouvellement (/portal), aucune copie hors ligne des données d'un enfant.

let accessToken: string | null = null;

export function setPortalToken(token: string | null): void {
  accessToken = token;
}

async function extractError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    return new ApiError(message ?? `Erreur ${res.status}`, res.status, body);
  } catch {
    return new ApiError(`Erreur ${res.status}`, res.status);
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("Pas de connexion Internet.", 0);
  }
}

/** Renouvelle le jeton avec le cookie : vrai si une session existe encore. */
export async function tryPortalRefresh(): Promise<boolean> {
  try {
    const res = await send("/portal/refresh", { method: "POST" });
    if (!res.ok) return false;
    accessToken = ((await res.json()) as { accessToken: string }).accessToken;
    return true;
  } catch {
    return false;
  }
}

const NO_RETRY = ["/portal/login", "/portal/activate", "/portal/refresh"];

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await send(path, init);
  if (res.status === 401 && retry && !NO_RETRY.includes(path)) {
    if (await tryPortalRefresh()) return request<T>(path, init, false);
    accessToken = null;
    throw new ApiError("Session expirée, veuillez vous reconnecter.", 401);
  }
  if (!res.ok) throw await extractError(res);
  return (await res.json()) as T;
}

export const portalApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
};

export function describePortalError(err: unknown): string {
  if (err instanceof ApiError) return err.status === 0 ? "Pas de connexion Internet. Réessayez quand elle sera revenue." : err.message;
  return "Une erreur est survenue.";
}
