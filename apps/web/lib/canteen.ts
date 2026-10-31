// Cantine : fonctions pures de l'écran de vente (sélection des jours, total, calendrier). Le serveur refait tous les
// contrôles (jour de cantine, ouvert, pas déjà payé, total) : rien ici n'est une sécurité. Contrôlées par
// `node scripts/check-canteen.mjs`.

export interface CanteenDayState {
  date: string; // AAAA-MM-JJ
  paye: boolean;
  ferme: boolean;
  motifFermeture: string | null;
}

/** Un jour qu'on peut encore vendre : ni déjà payé, ni sans classe. */
export const isSellable = (d: CanteenDayState): boolean => !d.paye && !d.ferme;

/** Tous les jours vendables du mois affiché (payer un mois complet = ses jours réels, fériés et vacances exclus). */
export function allSellable(days: CanteenDayState[]): string[] {
  return days.filter(isSellable).map((d) => d.date);
}

/** Les `n` premiers jours vendables à partir de `from` (compris), dans l'ordre. */
export function nextSellable(days: CanteenDayState[], n: number, from: string): string[] {
  return days
    .filter((d) => isSellable(d) && d.date >= from)
    .slice(0, Math.max(0, n))
    .map((d) => d.date);
}

/** Ajoute ou retire un jour de la sélection ; la liste reste triée et sans doublon. */
export function toggleDay(selected: string[], date: string): string[] {
  return selected.includes(date) ? selected.filter((d) => d !== date) : [...selected, date].sort();
}

/** Garde seulement les jours encore vendables (après un rechargement ou un changement de mois). */
export function keepSellable(selected: string[], days: CanteenDayState[]): string[] {
  const ok = new Set(allSellable(days));
  return selected.filter((d) => ok.has(d));
}

/** Total en XAF entiers (RG16) : nombre de jours × prix du jour. */
export const saleTotal = (n: number, prixJour: number): number => n * prixJour;

/** "AAAA-MM" du mois décalé de `delta` mois. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Le mois "AAAA-MM" d'un jour "AAAA-MM-JJ". */
export const monthOf = (day: string): string => day.slice(0, 7);

/** Nom court d'un jour de la semaine (0 = dimanche ... 6 = samedi) dans la langue Intl demandée. */
export function weekdayName(index: number, intlLocale: string, style: "short" | "long" = "long"): string {
  // 1er janvier 2023 : un dimanche.
  return new Intl.DateTimeFormat(intlLocale, { weekday: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, 0, 1 + index)),
  );
}

/** "lun. 2 nov." : jour de la semaine, jour et mois d'un "AAAA-MM-JJ". */
export function dayLabel(day: string, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** "novembre 2026" d'un "AAAA-MM". */
export function monthLabel(month: string, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/** "AAAA-MM-JJ" décalé de `n` jours. */
export function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
