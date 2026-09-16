/** Casse et accents ignorés — utilisé pour la détection de doublons (D33) et la recherche élève. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}
