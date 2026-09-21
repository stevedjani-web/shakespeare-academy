/** "HH:mm" -> minutes depuis minuit. Le format est déjà validé par les DTO. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "AAAA-MM-JJ" -> Date à minuit UTC (les colonnes `@db.Date` n'ont pas d'heure). */
export function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date -> "AAAA-MM-JJ" (UTC), pour comparer des jours sans se soucier de l'heure. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Comparaison insensible à la casse, aux espaces multiples et aux accents. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
