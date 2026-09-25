import type { NotificationType } from '@prisma/client';
import type { AppLanguage } from '../common/language';

/**
 * Textes des notifications, en français et en anglais. Deux niveaux, jamais mélangés :
 * - l'alerte push (canal externe) est GÉNÉRIQUE : le prénom de l'enfant et un renvoi vers l'application,
 *   jamais un motif, une note ou un montant (RV10, D69) ;
 * - le message dans l'application (authentifiée) peut donner le détail de la séance.
 * Aucun de ces textes ne contient le motif d'un changement ni celui d'un justificatif.
 * Chaque fonction prend la langue en dernier paramètre (français par défaut).
 */

export const PUSH_TITLE = 'Shakespeare Academy';

/**
 * Titre (français) d'une notification de message urgent : sert aussi à la reconnaître (elle n'est jamais
 * regroupée). Le titre anglais est enregistré à part, jamais utilisé pour la reconnaître.
 */
export const URGENT_MESSAGE_TITLE = 'Nouveau message urgent';

/** « Alice », « Alice et Brice », « Alice, Brice et Carine » (« Alice and Brice » en anglais). */
export function joinNames(names: string[], lang: AppLanguage = 'fr'): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? '';
  const and = lang === 'en' ? 'and' : 'et';
  return `${unique.slice(0, -1).join(', ')} ${and} ${unique[unique.length - 1]}`;
}

/** « de Brice » mais « d'Alice » : élision devant une voyelle ou un h muet. */
export function dePrenom(prenom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(prenom)
    ? `d'${prenom}`
    : `de ${prenom}`;
}

/** « la classe d'Alice » / « Alice's class » : le complément de nom change de forme selon la langue. */
function classOf(prenom: string, lang: AppLanguage): string {
  return lang === 'en' ? `${prenom}'s class` : `la classe ${dePrenom(prenom)}`;
}

export function pushBody(
  type: NotificationType,
  names: string[],
  urgent = false,
  lang: AppLanguage = 'fr',
): string {
  const who = joinNames(names, lang);
  if (lang === 'en') {
    // Only the "urgent" level is said, never the content of the message (RV10).
    if (urgent && type === 'MESSAGE_RECU')
      return `You have a new urgent message about ${who}. Open the app to read it.`;
    switch (type) {
      case 'ABSENCE':
        return `An absence has been reported for ${who}. Open the app for details.`;
      case 'RETARD':
        return `A late arrival has been reported for ${who}. Open the app for details.`;
      case 'ENSEIGNANT_ABSENT':
        return `A lesson for ${classOf(who, lang)} has been cancelled or replaced. Open the app for details.`;
      case 'EMPLOI_DU_TEMPS_MODIFIE':
        return `The timetable for ${classOf(who, lang)} has changed. Open the app for details.`;
      case 'MESSAGE_RECU':
        return `You have a new message about ${who}. Open the app to read it.`;
      case 'ANNONCE':
        return `An announcement has been posted for ${classOf(who, lang)}. Open the app to read it.`;
      case 'BULLETIN_DISPONIBLE':
        return `A report card is available for ${who}. Open the app to view it.`;
      case 'DEVOIR_DONNE':
        return `Homework has been set for ${classOf(who, lang)}. Open the app to view it.`;
      case 'DISCIPLINE':
        return `A new school life item is available for ${who}. Open the app to view it.`;
    }
  }
  // Seul le niveau « urgent » est dit, jamais le contenu du message (RV10).
  if (urgent && type === 'MESSAGE_RECU')
    return `Vous avez un nouveau message urgent concernant ${who}. Ouvrez l'application pour le lire.`;
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

export function notificationTitle(
  type: NotificationType,
  lang: AppLanguage = 'fr',
): string {
  if (lang === 'en') {
    switch (type) {
      case 'ABSENCE':
        return 'Absence reported';
      case 'RETARD':
        return 'Late arrival reported';
      case 'ENSEIGNANT_ABSENT':
        return 'Lesson cancelled or replaced';
      case 'EMPLOI_DU_TEMPS_MODIFIE':
        return 'Timetable change';
      case 'MESSAGE_RECU':
        return 'New message';
      case 'ANNONCE':
        return 'New announcement';
      case 'BULLETIN_DISPONIBLE':
        return 'Report card available';
      case 'DEVOIR_DONNE':
        return 'New homework';
      case 'DISCIPLINE':
        return 'School life';
    }
  }
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

/** Titre d'une notification de message urgent, dans la langue voulue. */
export function urgentMessageTitle(lang: AppLanguage = 'fr'): string {
  return lang === 'en' ? 'New urgent message' : URGENT_MESSAGE_TITLE;
}

/** « 2026-09-21 » devient « 21/09/2026 » (même forme en français et en anglais britannique). */
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

const where = (s: SessionInfo, lang: AppLanguage) =>
  lang === 'en'
    ? `${s.matiere}, from ${s.heureDebut} to ${s.heureFin}, on ${frenchDate(s.date)}`
    : `${s.matiere}, de ${s.heureDebut} à ${s.heureFin}, le ${frenchDate(s.date)}`;

export function absenceBody(s: SessionInfo, lang: AppLanguage = 'fr'): string {
  return lang === 'en'
    ? `An absence has been recorded for ${s.prenom}: ${where(s, lang)}.`
    : `Une absence a été saisie pour ${s.prenom} : ${where(s, lang)}.`;
}

export function retardBody(
  s: SessionInfo,
  minutes: number | null,
  lang: AppLanguage = 'fr',
): string {
  if (lang === 'en') {
    const delay = minutes
      ? ` of ${minutes} minute${minutes > 1 ? 's' : ''}`
      : '';
    return `A late arrival${delay} has been recorded for ${s.prenom}: ${where(s, lang)}.`;
  }
  const delay = minutes ? ` de ${minutes} minute${minutes > 1 ? 's' : ''}` : '';
  return `Un retard${delay} a été saisi pour ${s.prenom} : ${where(s, lang)}.`;
}

export function canceledBody(s: SessionInfo, lang: AppLanguage = 'fr'): string {
  return lang === 'en'
    ? `For ${classOf(s.prenom, lang)}, the session ${where(s, lang)} is cancelled.`
    : `Pour la classe ${dePrenom(s.prenom)}, la séance ${where(s, lang)} est annulée.`;
}

export function replacedBody(s: SessionInfo, lang: AppLanguage = 'fr'): string {
  return lang === 'en'
    ? `For ${classOf(s.prenom, lang)}, the session ${where(s, lang)} will be taught by another teacher.`
    : `Pour la classe ${dePrenom(s.prenom)}, la séance ${where(s, lang)} sera assurée par un autre enseignant.`;
}

export function roomChangedBody(
  s: SessionInfo,
  salle: string,
  lang: AppLanguage = 'fr',
): string {
  return lang === 'en'
    ? `For ${classOf(s.prenom, lang)}, the session ${where(s, lang)} is moving to another room: ${salle}.`
    : `Pour la classe ${dePrenom(s.prenom)}, la séance ${where(s, lang)} change de salle : ${salle}.`;
}

export function publishedBody(
  prenom: string,
  dateEffet: string,
  lang: AppLanguage = 'fr',
): string {
  return lang === 'en'
    ? `A new timetable for ${classOf(prenom, lang)} takes effect on ${frenchDate(dateEffet)}.`
    : `Un nouvel emploi du temps de la classe ${dePrenom(prenom)} entre en vigueur le ${frenchDate(dateEffet)}.`;
}

/** Corps d'une notification qui en regroupe plusieurs (même journée pour une absence, même fenêtre sinon). */
export function mergedBody(
  type: NotificationType,
  prenom: string,
  count: number,
  jour: string,
  lang: AppLanguage = 'fr',
): string {
  if (lang === 'en') {
    switch (type) {
      case 'ABSENCE':
        return `${count} absences have been recorded for ${prenom} on ${frenchDate(jour)}. The session-by-session detail is in the Absences tab.`;
      case 'RETARD':
        return `${count} late arrivals have been recorded for ${prenom} on ${frenchDate(jour)}. The detail is in the Absences tab.`;
      case 'ENSEIGNANT_ABSENT':
        return `${count} sessions of ${classOf(prenom, lang)} are cancelled or replaced on ${frenchDate(jour)}. The detail is in the timetable.`;
      case 'EMPLOI_DU_TEMPS_MODIFIE':
        return `${count} timetable changes have been recorded for ${classOf(prenom, lang)}. Check the timetable.`;
      case 'MESSAGE_RECU':
        return `${count} new messages about ${prenom} are waiting for you in the messaging area.`;
      case 'ANNONCE':
        return `${count} announcements have been posted for ${classOf(prenom, lang)}. Check the announcements.`;
      case 'BULLETIN_DISPONIBLE':
        return `${count} report cards are available for ${prenom}. Check the Report cards tab.`;
      case 'DEVOIR_DONNE':
        return `${count} homework items have been set for ${classOf(prenom, lang)}. Check the Homework tab.`;
      case 'DISCIPLINE':
        return `${count} school life items are available for ${prenom}. Check the School life tab.`;
    }
  }
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
export function disciplineBody(
  prenom: string,
  lang: AppLanguage = 'fr',
): string {
  return lang === 'en'
    ? `A new school life item is available for ${prenom}. Check the School life tab.`
    : `Un nouvel élément de vie scolaire est disponible pour ${prenom}. Consultez l'onglet Vie scolaire.`;
}

export function messageReceivedBody(
  prenom: string,
  from: string,
  urgent = false,
  lang: AppLanguage = 'fr',
): string {
  if (lang === 'en')
    return urgent
      ? `You have received an urgent message from ${from} about ${prenom}.`
      : `You have received a message from ${from} about ${prenom}.`;
  return urgent
    ? `Vous avez reçu un message urgent de ${from} à propos de ${prenom}.`
    : `Vous avez reçu un message de ${from} à propos de ${prenom}.`;
}

/** Dans l'application (authentifiée) : la matière et l'échéance, jamais le texte du devoir. */
export function homeworkBody(
  prenom: string,
  matiere: string,
  echeance: string | null,
  lang: AppLanguage = 'fr',
): string {
  if (lang === 'en') {
    const due = echeance ? `, due on ${frenchDate(echeance)}` : '';
    return `New ${matiere} homework for ${classOf(prenom, lang)}${due}. Check the Homework tab.`;
  }
  const due = echeance ? `, à rendre pour le ${frenchDate(echeance)}` : '';
  return `Nouveau devoir de ${matiere} pour la classe ${dePrenom(prenom)}${due}. Consultez l'onglet Devoirs.`;
}

/** Dans l'application (authentifiée) : le trimestre, jamais une note ni une moyenne. */
export function bulletinBody(
  prenom: string,
  trimestre: string,
  lang: AppLanguage = 'fr',
): string {
  return lang === 'en'
    ? `The report card for ${trimestre} is available for ${prenom}. Check the Report cards tab.`
    : `Le bulletin du ${trimestre} est disponible pour ${prenom}. Consultez l'onglet Bulletins.`;
}

export function announcementBody(
  prenom: string,
  titre: string,
  lang: AppLanguage = 'fr',
): string {
  return lang === 'en'
    ? `New announcement for ${classOf(prenom, lang)}: “${titre}”.`
    : `Nouvelle annonce pour la classe ${dePrenom(prenom)} : « ${titre} ».`;
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
