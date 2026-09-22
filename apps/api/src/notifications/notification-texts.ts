import type { NotificationType } from '@prisma/client';

/**
 * Textes des notifications, en français (D68). Deux niveaux, jamais mélangés :
 * - l'alerte push (canal externe) est GÉNÉRIQUE : le prénom de l'enfant et un renvoi vers l'application,
 *   jamais un motif, une note ou un montant (RV10, D69) ;
 * - le message dans l'application (authentifiée) peut donner le détail de la séance.
 * Aucun de ces textes ne contient le motif d'un changement ni celui d'un justificatif.
 */

export const PUSH_TITLE = 'Shakespeare Academy';

/** « Alice », « Alice et Brice », « Alice, Brice et Carine ». */
export function joinNames(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? '';
  return `${unique.slice(0, -1).join(', ')} et ${unique[unique.length - 1]}`;
}

/** « de Brice » mais « d'Alice » : élision devant une voyelle ou un h muet. */
export function dePrenom(prenom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(prenom)
    ? `d'${prenom}`
    : `de ${prenom}`;
}

export function pushBody(type: NotificationType, names: string[]): string {
  const who = joinNames(names);
  switch (type) {
    case 'ABSENCE':
      return `Une absence a été signalée pour ${who}. Ouvrez l'application pour le détail.`;
    case 'RETARD':
      return `Un retard a été signalé pour ${who}. Ouvrez l'application pour le détail.`;
    case 'ENSEIGNANT_ABSENT':
      return `Un cours de la classe ${dePrenom(who)} est annulé ou remplacé. Ouvrez l'application pour le détail.`;
    case 'EMPLOI_DU_TEMPS_MODIFIE':
      return `L'emploi du temps de la classe ${dePrenom(who)} a changé. Ouvrez l'application pour le détail.`;
    // Jamais le contenu du message ni de l'annonce (RV10) : seulement qu'il y en a un.
    case 'MESSAGE_RECU':
      return `Vous avez un nouveau message concernant ${who}. Ouvrez l'application pour le lire.`;
    case 'ANNONCE':
      return `Une annonce a été publiée pour la classe ${dePrenom(who)}. Ouvrez l'application pour la lire.`;
    // Jamais une note ni une moyenne (RV10) : seulement qu'un bulletin est disponible.
    case 'BULLETIN_DISPONIBLE':
      return `Un bulletin est disponible pour ${who}. Ouvrez l'application pour le consulter.`;
    // Ni la matière ni le contenu du devoir dans l'alerte externe (RV10) : seulement qu'un devoir a été donné.
    case 'DEVOIR_DONNE':
      return `Un devoir a été donné pour la classe ${dePrenom(who)}. Ouvrez l'application pour le consulter.`;
    // Ni la nature ni le motif (RV10) : seulement qu'un élément de vie scolaire est disponible.
    case 'DISCIPLINE':
      return `Un nouvel élément de vie scolaire est disponible pour ${who}. Ouvrez l'application pour le consulter.`;
  }
}

export function notificationTitle(type: NotificationType): string {
  switch (type) {
    case 'ABSENCE':
      return 'Absence signalée';
    case 'RETARD':
      return 'Retard signalé';
    case 'ENSEIGNANT_ABSENT':
      return 'Cours annulé ou remplacé';
    case 'EMPLOI_DU_TEMPS_MODIFIE':
      return "Changement d'emploi du temps";
    case 'MESSAGE_RECU':
      return 'Nouveau message';
    case 'ANNONCE':
      return 'Nouvelle annonce';
    case 'BULLETIN_DISPONIBLE':
      return 'Bulletin disponible';
    case 'DEVOIR_DONNE':
      return 'Nouveau devoir';
    case 'DISCIPLINE':
      return 'Vie scolaire';
  }
}

/** « 2026-09-21 » devient « 21/09/2026 ». */
export function frenchDate(isoDay: string): string {
  const [y, m, d] = isoDay.split('-');
  return `${d}/${m}/${y}`;
}

export interface SessionInfo {
  prenom: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
}

const where = (s: SessionInfo) =>
  `${s.matiere}, de ${s.heureDebut} à ${s.heureFin}, le ${frenchDate(s.date)}`;

export function absenceBody(s: SessionInfo): string {
  return `Une absence a été saisie pour ${s.prenom} : ${where(s)}.`;
}

export function retardBody(s: SessionInfo, minutes: number | null): string {
  const delay = minutes ? ` de ${minutes} minute${minutes > 1 ? 's' : ''}` : '';
  return `Un retard${delay} a été saisi pour ${s.prenom} : ${where(s)}.`;
}

export function canceledBody(s: SessionInfo): string {
  return `Pour la classe ${dePrenom(s.prenom)}, la séance ${where(s)} est annulée.`;
}

export function replacedBody(s: SessionInfo): string {
  return `Pour la classe ${dePrenom(s.prenom)}, la séance ${where(s)} sera assurée par un autre enseignant.`;
}

export function roomChangedBody(s: SessionInfo, salle: string): string {
  return `Pour la classe ${dePrenom(s.prenom)}, la séance ${where(s)} change de salle : ${salle}.`;
}

export function publishedBody(prenom: string, dateEffet: string): string {
  return `Un nouvel emploi du temps de la classe ${dePrenom(prenom)} entre en vigueur le ${frenchDate(dateEffet)}.`;
}

/** Corps d'une notification qui en regroupe plusieurs (même journée pour une absence, même fenêtre sinon). */
export function mergedBody(
  type: NotificationType,
  prenom: string,
  count: number,
  jour: string,
): string {
  switch (type) {
    case 'ABSENCE':
      return `${count} absences ont été saisies pour ${prenom} le ${frenchDate(jour)}. Le détail séance par séance est dans l'onglet Absences.`;
    case 'RETARD':
      return `${count} retards ont été saisis pour ${prenom} le ${frenchDate(jour)}. Le détail est dans l'onglet Absences.`;
    case 'ENSEIGNANT_ABSENT':
      return `${count} séances de la classe ${dePrenom(prenom)} sont annulées ou remplacées le ${frenchDate(jour)}. Le détail est dans l'emploi du temps.`;
    case 'EMPLOI_DU_TEMPS_MODIFIE':
      return `${count} changements de l'emploi du temps de la classe ${dePrenom(prenom)} ont été enregistrés. Consultez l'emploi du temps.`;
    case 'MESSAGE_RECU':
      return `${count} nouveaux messages concernant ${prenom} vous attendent dans la messagerie.`;
    case 'ANNONCE':
      return `${count} annonces ont été publiées pour la classe ${dePrenom(prenom)}. Consultez les annonces.`;
    case 'BULLETIN_DISPONIBLE':
      return `${count} bulletins sont disponibles pour ${prenom}. Consultez l'onglet Bulletins.`;
    case 'DEVOIR_DONNE':
      return `${count} devoirs ont été donnés pour la classe ${dePrenom(prenom)}. Consultez l'onglet Devoirs.`;
    case 'DISCIPLINE':
      return `${count} éléments de vie scolaire sont disponibles pour ${prenom}. Consultez l'onglet Vie scolaire.`;
  }
}

/** Dans l'application (authentifiée) comme dans l'alerte : jamais la nature, le motif ni la sanction (RV10). */
export function disciplineBody(prenom: string): string {
  return `Un nouvel élément de vie scolaire est disponible pour ${prenom}. Consultez l'onglet Vie scolaire.`;
}

export function messageReceivedBody(prenom: string, from: string): string {
  return `Vous avez reçu un message de ${from} à propos de ${prenom}.`;
}

/** Dans l'application (authentifiée) : la matière et l'échéance, jamais le texte du devoir. */
export function homeworkBody(
  prenom: string,
  matiere: string,
  echeance: string | null,
): string {
  const due = echeance ? `, à rendre pour le ${frenchDate(echeance)}` : '';
  return `Nouveau devoir de ${matiere} pour la classe ${dePrenom(prenom)}${due}. Consultez l'onglet Devoirs.`;
}

/** Dans l'application (authentifiée) : le trimestre, jamais une note ni une moyenne. */
export function bulletinBody(prenom: string, trimestre: string): string {
  return `Le bulletin du ${trimestre} est disponible pour ${prenom}. Consultez l'onglet Bulletins.`;
}

export function announcementBody(prenom: string, titre: string): string {
  return `Nouvelle annonce pour la classe ${dePrenom(prenom)} : « ${titre} ».`;
}

/**
 * Regroupement (D71) : les absences, retards et cours annulés sont signalés tout de suite, mais un
 * même enfant absent toute la journée ne génère pas une alerte par séance ; ils sont regroupés par
 * journée. Les changements d'emploi du temps sont regroupés par fenêtre de temps paramétrée.
 */
export function coalescePolicy(type: NotificationType): 'JOUR' | 'FENETRE' {
  // Les annonces et les changements d'emploi du temps sont regroupés par fenêtre de temps ; le reste, tout de suite.
  return type === 'EMPLOI_DU_TEMPS_MODIFIE' ||
    type === 'ANNONCE' ||
    type === 'DEVOIR_DONNE' ||
    type === 'DISCIPLINE'
    ? 'FENETRE'
    : 'JOUR';
}
