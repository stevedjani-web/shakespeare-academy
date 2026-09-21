import { toMinutes } from '../timetable/timetable.util';

/** Décalage (en ms) du fuseau `timeZone` par rapport à UTC à l'instant donné. */
function timezoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - (instantMs - (instantMs % 1000));
}

/** Instant réel de « jour + HH:mm » dans le fuseau de l'établissement (les séances sont en heure locale). */
export function localToInstant(
  day: string,
  hhmm: string,
  timeZone: string,
): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = timezoneOffsetMs(guess, timeZone);
  let instant = guess - first;
  const second = timezoneOffsetMs(instant, timeZone);
  if (second !== first) instant = guess - second;
  return new Date(instant);
}

/** Minutes entières entre deux instants (positif si `later` est après `earlier`). */
export function minutesBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 60000);
}

/** Durée prévue d'une séance, en minutes. */
export function plannedMinutes(heureDebut: string, heureFin: string): number {
  return toMinutes(heureFin) - toMinutes(heureDebut);
}

/** "HH:mm" d'un instant, dans le fuseau de l'établissement. */
export function timeInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}
