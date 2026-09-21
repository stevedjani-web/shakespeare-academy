import { addDays, weekdayOf } from '../timetable/timetable.util';

/** Jour civil ("AAAA-MM-JJ") d'un instant, dans le fuseau horaire de l'établissement. */
export function dayInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Statut d'un élève d'après les minutes de retard (RV05, D57) : rien = présent, jusqu'au seuil = en
 * retard, au-delà = absent de la séance. Le seuil vient des paramètres, jamais du code.
 */
export function statusForDelay(minutes: number, retardMaxMinutes: number): 'PRESENT' | 'RETARD' | 'ABSENT' {
  if (minutes <= 0) return 'PRESENT';
  return minutes <= retardMaxMinutes ? 'RETARD' : 'ABSENT';
}

/**
 * Date limite pour justifier une absence : `n` jours de classe après le jour d'absence (D58). On ne
 * compte que les jours de classe de l'établissement, hors jours sans classe du calendrier.
 */
export function justificationDeadline(
  absenceDay: string,
  n: number,
  joursClasse: number[],
  closures: Array<{ debut: string; fin: string }>,
): string {
  let day = absenceDay;
  let counted = 0;
  // Garde-fou : jamais plus d'un an de recherche, même avec des paramètres absurdes.
  for (let i = 0; i < 366 && counted < n; i += 1) {
    day = addDays(day, 1);
    const closed = closures.some((c) => day >= c.debut && day <= c.fin);
    if (joursClasse.includes(weekdayOf(day)) && !closed) counted += 1;
  }
  return day;
}
