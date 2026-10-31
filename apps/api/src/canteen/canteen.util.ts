import { addDays, weekdayOf } from '../timetable/timetable.util';

/** Jour sans classe du calendrier de l'année (vacances, férié, autre fermeture), dates "AAAA-MM-JJ" incluses. */
export interface Closure {
  debut: string;
  fin: string;
  libelle: string;
}

/** Le premier jour sans classe qui couvre ce jour, s'il y en a un. */
export function closureOn(day: string, closures: Closure[]): Closure | null {
  return closures.find((c) => day >= c.debut && day <= c.fin) ?? null;
}

/**
 * Un jour de cantine est un jour de la semaine de cantine ET un jour de classe : la cantine ne sert jamais un jour où
 * l'école n'ouvre pas (le samedi, par exemple, si elle n'y a pas classe).
 */
export function isCanteenWeekday(
  day: string,
  canteenDays: readonly number[],
  schoolDays: readonly number[],
): boolean {
  const wd = weekdayOf(day);
  return canteenDays.includes(wd) && schoolDays.includes(wd);
}

/** Tous les jours "AAAA-MM-JJ" d'un mois "AAAA-MM". */
export function daysOfMonth(month: string): string[] {
  const out: string[] = [];
  let day = `${month}-01`;
  while (day.startsWith(month)) {
    out.push(day);
    day = addDays(day, 1);
  }
  return out;
}

/** "AAAA-MM-JJ" valide (le 2026-02-30 n'existe pas). */
export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "AAAA-MM" valide. */
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "AAAA-MM-JJ" -> "JJ/MM/AAAA". */
export function frDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** Libellé figé de la ligne de facture (RG03), jamais retraduit : « Cantine — 12 jours (03/11/2026 au 26/11/2026) ». */
export function saleLabel(sortedDays: string[]): string {
  const n = sortedDays.length;
  const range =
    n > 1
      ? `${frDate(sortedDays[0])} au ${frDate(sortedDays[n - 1])}`
      : frDate(sortedDays[0]);
  return `Cantine — ${n} jour${n > 1 ? 's' : ''} (${range})`;
}
