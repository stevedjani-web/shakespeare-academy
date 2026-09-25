// Aide contextuelle (demande explicite de l'utilisateur, 23 septembre 2026) : source unique de vérité pour
// deux usages qui ne doivent jamais diverger — la puce d'aide (`HelpTip`) affichée sur chaque écran et
// la page /aide (sommaire complet, filtré par permission). Ajouter une entrée ici suffit à alimenter les deux.
//
// Les textes vivent dans le dictionnaire (`lib/i18n/messages/domains/content.ts`, clés `cnt.help.*`) : ici, seulement
// des CLÉS, résolues dans la langue courante au moment de l'affichage (`t(entry.titleKey)`), jamais au chargement du module.
//
// Chaque identifiant sert aussi d'ancre sur /aide (`/aide#<id>`) : le lien "Voir le guide complet" d'une
// puce y renvoie directement. `permission`/`anyPermission` reprennent exactement les codes déjà utilisés
// par la navigation (`components/app-shell.tsx`) — jamais une nouvelle notion de visibilité à maintenir
// en double : une rubrique invisible dans le menu reste invisible sur /aide.
import type { MessageKey } from "@/lib/i18n";

export interface HelpEntry {
  id: string;
  titleKey: MessageKey;
  /** 2 à 5 conseils courts et actionnables — jamais un paragraphe. */
  tipKeys: MessageKey[];
  permission?: string;
  anyPermission?: string[];
}

export const HELP_CONTENT: Record<string, HelpEntry> = {
  "eleves": {
    id: "eleves",
    titleKey: "cnt.help.eleves.title",
    tipKeys: [
      "cnt.help.eleves.tip1",
      "cnt.help.eleves.tip2",
      "cnt.help.eleves.tip3",
      "cnt.help.eleves.tip4",
    ],
    permission: "STUDENT_READ",
  },
  "eleves-inscription": {
    id: "eleves-inscription",
    titleKey: "cnt.help.eleves-inscription.title",
    tipKeys: [
      "cnt.help.eleves-inscription.tip1",
      "cnt.help.eleves-inscription.tip2",
      "cnt.help.eleves-inscription.tip3",
      "cnt.help.eleves-inscription.tip4",
    ],
    permission: "ENROLLMENT_MANAGE",
  },
  "tarifs": {
    id: "tarifs",
    titleKey: "cnt.help.tarifs.title",
    tipKeys: [
      "cnt.help.tarifs.tip1",
      "cnt.help.tarifs.tip2",
      "cnt.help.tarifs.tip3",
      "cnt.help.tarifs.tip4",
    ],
    permission: "FEE_MANAGE",
  },
  "eleves-dossier-paiements": {
    id: "eleves-dossier-paiements",
    titleKey: "cnt.help.eleves-dossier-paiements.title",
    tipKeys: [
      "cnt.help.eleves-dossier-paiements.tip1",
      "cnt.help.eleves-dossier-paiements.tip2",
      "cnt.help.eleves-dossier-paiements.tip3",
      "cnt.help.eleves-dossier-paiements.tip4",
      "cnt.help.eleves-dossier-paiements.tip5",
    ],
    permission: "PAYMENT_CREATE",
  },
  "vie-scolaire": {
    id: "vie-scolaire",
    titleKey: "cnt.help.vie-scolaire.title",
    tipKeys: [
      "cnt.help.vie-scolaire.tip1",
      "cnt.help.vie-scolaire.tip2",
      "cnt.help.vie-scolaire.tip3",
      "cnt.help.vie-scolaire.tip4",
    ],
    permission: "PEDAGOGY_MANAGE",
  },
  "tableau-de-bord": {
    id: "tableau-de-bord",
    titleKey: "cnt.help.tableau-de-bord.title",
    tipKeys: [
      "cnt.help.tableau-de-bord.tip1",
      "cnt.help.tableau-de-bord.tip2",
      "cnt.help.tableau-de-bord.tip3",
    ],
  },
  "eleves-par-classe": {
    id: "eleves-par-classe",
    titleKey: "cnt.help.eleves-par-classe.title",
    tipKeys: [
      "cnt.help.eleves-par-classe.tip1",
      "cnt.help.eleves-par-classe.tip2",
      "cnt.help.eleves-par-classe.tip3",
    ],
    permission: "STUDENT_READ",
  },
  "eleves-dossier": {
    id: "eleves-dossier",
    titleKey: "cnt.help.eleves-dossier.title",
    tipKeys: [
      "cnt.help.eleves-dossier.tip1",
      "cnt.help.eleves-dossier.tip2",
      "cnt.help.eleves-dossier.tip3",
      "cnt.help.eleves-dossier.tip4",
    ],
    permission: "STUDENT_READ",
  },
  "preinscriptions": {
    id: "preinscriptions",
    titleKey: "cnt.help.preinscriptions.title",
    tipKeys: [
      "cnt.help.preinscriptions.tip1",
      "cnt.help.preinscriptions.tip2",
      "cnt.help.preinscriptions.tip3",
    ],
    permission: "ENROLLMENT_MANAGE",
  },
  "emploi-du-temps": {
    id: "emploi-du-temps",
    titleKey: "cnt.help.emploi-du-temps.title",
    tipKeys: [
      "cnt.help.emploi-du-temps.tip1",
      "cnt.help.emploi-du-temps.tip2",
      "cnt.help.emploi-du-temps.tip3",
      "cnt.help.emploi-du-temps.tip4",
    ],
    permission: "TIMETABLE_READ",
  },
  "appel": {
    id: "appel",
    titleKey: "cnt.help.appel.title",
    tipKeys: [
      "cnt.help.appel.tip1",
      "cnt.help.appel.tip2",
      "cnt.help.appel.tip3",
      "cnt.help.appel.tip4",
    ],
    anyPermission: ["ATTENDANCE_READ", "ATTENDANCE_TAKE"],
  },
  "notes": {
    id: "notes",
    titleKey: "cnt.help.notes.title",
    tipKeys: [
      "cnt.help.notes.tip1",
      "cnt.help.notes.tip2",
      "cnt.help.notes.tip3",
      "cnt.help.notes.tip4",
    ],
    anyPermission: ["GRADE_ENTER", "GRADE_READ"],
  },
  "discipline": {
    id: "discipline",
    titleKey: "cnt.help.discipline.title",
    tipKeys: [
      "cnt.help.discipline.tip1",
      "cnt.help.discipline.tip2",
      "cnt.help.discipline.tip3",
      "cnt.help.discipline.tip4",
    ],
    anyPermission: ["DISCIPLINE_REPORT", "DISCIPLINE_READ", "DISCIPLINE_DECIDE", "DISCIPLINE_CONVOKE"],
  },
  "cahier-de-textes": {
    id: "cahier-de-textes",
    titleKey: "cnt.help.cahier-de-textes.title",
    tipKeys: [
      "cnt.help.cahier-de-textes.tip1",
      "cnt.help.cahier-de-textes.tip2",
      "cnt.help.cahier-de-textes.tip3",
    ],
    anyPermission: ["TEXTBOOK_WRITE", "TEXTBOOK_READ"],
  },
  "pointage": {
    id: "pointage",
    titleKey: "cnt.help.pointage.title",
    tipKeys: [
      "cnt.help.pointage.tip1",
      "cnt.help.pointage.tip2",
      "cnt.help.pointage.tip3",
    ],
    permission: "TEACHER_CHECKIN_SELF",
  },
  "pointage-enseignants": {
    id: "pointage-enseignants",
    titleKey: "cnt.help.pointage-enseignants.title",
    tipKeys: [
      "cnt.help.pointage-enseignants.tip1",
      "cnt.help.pointage-enseignants.tip2",
      "cnt.help.pointage-enseignants.tip3",
    ],
    permission: "TEACHER_CHECKIN_READ",
  },
  "portail-parents": {
    id: "portail-parents",
    titleKey: "cnt.help.portail-parents.title",
    tipKeys: [
      "cnt.help.portail-parents.tip1",
      "cnt.help.portail-parents.tip2",
      "cnt.help.portail-parents.tip3",
    ],
    permission: "PARENT_ACCOUNT_MANAGE",
  },
  "pilotage": {
    id: "pilotage",
    titleKey: "cnt.help.pilotage.title",
    tipKeys: [
      "cnt.help.pilotage.tip1",
      "cnt.help.pilotage.tip2",
      "cnt.help.pilotage.tip3",
    ],
    permission: "PILOTAGE_READ",
  },
  "messagerie": {
    id: "messagerie",
    titleKey: "cnt.help.messagerie.title",
    tipKeys: [
      "cnt.help.messagerie.tip1",
      "cnt.help.messagerie.tip2",
      "cnt.help.messagerie.tip3",
    ],
    permission: "MESSAGE_USE",
  },
  "annonces": {
    id: "annonces",
    titleKey: "cnt.help.annonces.title",
    tipKeys: [
      "cnt.help.annonces.tip1",
      "cnt.help.annonces.tip2",
      "cnt.help.annonces.tip3",
    ],
    permission: "MESSAGE_USE",
  },
  "insolvables": {
    id: "insolvables",
    titleKey: "cnt.help.insolvables.title",
    tipKeys: [
      "cnt.help.insolvables.tip1",
      "cnt.help.insolvables.tip2",
      "cnt.help.insolvables.tip3",
    ],
    permission: "FINANCE_READ",
  },
  "paiements-en-ligne": {
    id: "paiements-en-ligne",
    titleKey: "cnt.help.paiements-en-ligne.title",
    tipKeys: [
      "cnt.help.paiements-en-ligne.tip1",
      "cnt.help.paiements-en-ligne.tip2",
      "cnt.help.paiements-en-ligne.tip3",
    ],
    permission: "FINANCE_READ",
  },
  "depenses": {
    id: "depenses",
    titleKey: "cnt.help.depenses.title",
    tipKeys: [
      "cnt.help.depenses.tip1",
      "cnt.help.depenses.tip2",
      "cnt.help.depenses.tip3",
    ],
    permission: "CASH_CLOSE",
  },
  "cloture": {
    id: "cloture",
    titleKey: "cnt.help.cloture.title",
    tipKeys: [
      "cnt.help.cloture.tip1",
      "cnt.help.cloture.tip2",
      "cnt.help.cloture.tip3",
    ],
    permission: "CASH_CLOSE",
  },
  "parametres-annees": {
    id: "parametres-annees",
    titleKey: "cnt.help.parametres-annees.title",
    tipKeys: [
      "cnt.help.parametres-annees.tip1",
      "cnt.help.parametres-annees.tip2",
    ],
    permission: "SETTINGS_READ",
  },
  "parametres-structure": {
    id: "parametres-structure",
    titleKey: "cnt.help.parametres-structure.title",
    tipKeys: [
      "cnt.help.parametres-structure.tip1",
      "cnt.help.parametres-structure.tip2",
    ],
    permission: "SETTINGS_READ",
  },
  "parametres-utilisateurs": {
    id: "parametres-utilisateurs",
    titleKey: "cnt.help.parametres-utilisateurs.title",
    tipKeys: [
      "cnt.help.parametres-utilisateurs.tip1",
      "cnt.help.parametres-utilisateurs.tip2",
      "cnt.help.parametres-utilisateurs.tip3",
    ],
    permission: "USER_MANAGE",
  },
  "parametres-etablissement": {
    id: "parametres-etablissement",
    titleKey: "cnt.help.parametres-etablissement.title",
    tipKeys: [
      "cnt.help.parametres-etablissement.tip1",
      "cnt.help.parametres-etablissement.tip2",
    ],
    permission: "SETTINGS_READ",
  },
  "hors-ligne": {
    id: "hors-ligne",
    titleKey: "cnt.help.hors-ligne.title",
    tipKeys: [
      "cnt.help.hors-ligne.tip1",
      "cnt.help.hors-ligne.tip2",
      "cnt.help.hors-ligne.tip3",
    ],
  },
  "audit": {
    id: "audit",
    titleKey: "cnt.help.audit.title",
    tipKeys: [
      "cnt.help.audit.tip1",
      "cnt.help.audit.tip2",
      "cnt.help.audit.tip3",
    ],
    permission: "AUDIT_LOG_READ",
  },
  "liens-utiles": {
    id: "liens-utiles",
    titleKey: "cnt.help.liens-utiles.title",
    tipKeys: [
      "cnt.help.liens-utiles.tip1",
      "cnt.help.liens-utiles.tip2",
    ],
  },
};

/** Liste ordonnée pour l'affichage sur /aide (l'ordre du menu, pas l'ordre alphabétique des clés). */
export const HELP_ORDER = [
  "tableau-de-bord",
  "eleves",
  "eleves-dossier",
  "eleves-dossier-paiements",
  "eleves-par-classe",
  "eleves-inscription",
  "preinscriptions",
  "vie-scolaire",
  "emploi-du-temps",
  "appel",
  "notes",
  "discipline",
  "cahier-de-textes",
  "pointage",
  "pointage-enseignants",
  "portail-parents",
  "pilotage",
  "messagerie",
  "annonces",
  "tarifs",
  "insolvables",
  "paiements-en-ligne",
  "depenses",
  "cloture",
  "parametres-annees",
  "parametres-structure",
  "parametres-utilisateurs",
  "parametres-etablissement",
  "hors-ligne",
  "audit",
  "liens-utiles",
];
