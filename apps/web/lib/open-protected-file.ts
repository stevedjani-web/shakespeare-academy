import { api, isOfflineError } from "@/lib/api";

/**
 * Ouvre un fichier protégé (justificatif, bordereau) : une balise `<a>` ne peut pas porter le jeton, on lit donc le fichier
 * avec lui puis on l'affiche. La fenêtre s'ouvre tout de suite (clic de l'utilisateur) : sinon le navigateur bloque
 * l'ouverture après l'attente ; sans fenêtre possible, le fichier est téléchargé. Renvoie `offline` ou `error` en cas d'échec.
 */
export async function openProtectedFile(path: string, filename: string): Promise<"ok" | "offline" | "error"> {
  const win = window.open("", "_blank");
  try {
    if (!win) {
      await api.download(path, filename);
      return "ok";
    }
    const url = URL.createObjectURL(await api.blob(path));
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "ok";
  } catch (err) {
    win?.close();
    return isOfflineError(err) ? "offline" : "error";
  }
}
