/** "HH:mm" -> minutes depuis minuit. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Deux intervalles [d1, f1) et [d2, f2) se chevauchent-ils ? Un créneau qui commence quand l'autre finit ne chevauche pas. */
export function overlaps(
  debut1: string,
  fin1: string,
  debut2: string,
  fin2: string,
): boolean {
  return toMinutes(debut1) < toMinutes(fin2) && toMinutes(fin1) > toMinutes(debut2);
}

/** "AAAA-MM-JJ" -> Date à minuit UTC. */
export function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Jour de la semaine, 0 = dimanche ... 6 = samedi (même convention que School.joursClasse). */
export function weekdayOf(day: string): number {
  return toDateOnly(day).getUTCDay();
}

export function addDays(day: string, n: number): string {
  const d = toDateOnly(day);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** Lundi de la semaine qui contient `day` (semaine du lundi au dimanche). */
export function mondayOf(day: string): string {
  const wd = weekdayOf(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}
