/** Longueur maximale d'un message ou d'une annonce (texte seul, D75). */
export const MESSAGE_MAX_LENGTH = 2000;
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;

/**
 * Un texte contient-il quelque chose qui ressemble à un numéro de téléphone ? (RV09 : aucun numéro
 * personnel n'est échangé.) On cherche une suite de chiffres, éventuellement séparés par des espaces,
 * points, tirets ou parenthèses, d'au moins `minChiffres` chiffres. Le seuil vient des paramètres de
 * l'école : à 9 chiffres, une date comme « 21.09.2026 » (8 chiffres) ou un montant ne sont pas refusés,
 * mais « 06 12 34 56 78 » ou « +242 06 000 0001 » le sont. Un seuil de 0 désactive le contrôle.
 */
export function looksLikePhoneNumber(
  text: string,
  minChiffres: number,
): boolean {
  if (minChiffres <= 0) return false;
  // Une « suite » : chiffre, puis (séparateur simple ou rien) et chiffre, autant de fois que nécessaire.
  const runs = text.match(/\+?\d(?:[\s.\-()]{0,2}\d)*/g) ?? [];
  return runs.some((run) => run.replace(/\D/g, '').length >= minChiffres);
}

/** Texte nettoyé : espaces de bord retirés, retours à la ligne multiples réduits à deux. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
