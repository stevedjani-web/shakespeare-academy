/**
 * Couleurs proposées pour une matière dans l'emploi du temps. Une couleur est enregistrée par son nom (jamais par un
 * code hexadécimal libre) : le site en fait des teintes lisibles, texte foncé sur fond clair. Une matière sans couleur
 * en reçoit une automatiquement à l'affichage, choisie d'après son code (voir `apps/web/lib/subject-colors.ts`, qui
 * porte la même liste et les teintes).
 */
export const SUBJECT_COLORS = [
  'blue',
  'red',
  'green',
  'orange',
  'purple',
  'teal',
  'pink',
  'yellow',
  'indigo',
  'lime',
  'cyan',
  'gray',
] as const;

export type SubjectColor = (typeof SUBJECT_COLORS)[number];
