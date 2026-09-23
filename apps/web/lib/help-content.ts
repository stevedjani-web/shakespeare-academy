// Aide contextuelle (demande explicite de l'utilisateur, 23 septembre 2026) : source unique de vérité pour
// deux usages qui ne doivent jamais diverger — la puce d'aide (`HelpTip`) affichée sur chaque écran et
// la page /aide (sommaire complet, filtré par permission). Ajouter une entrée ici suffit à alimenter les deux.
//
// Chaque identifiant sert aussi d'ancre sur /aide (`/aide#<id>`) : le lien "Voir le guide complet" d'une
// puce y renvoie directement. `permission`/`anyPermission` reprennent exactement les codes déjà utilisés
// par la navigation (`components/app-shell.tsx`) — jamais une nouvelle notion de visibilité à maintenir
// en double : une rubrique invisible dans le menu reste invisible sur /aide.

export interface HelpEntry {
  id: string;
  title: string;
  /** 2 à 5 conseils courts et actionnables — jamais un paragraphe. */
  tips: string[];
  permission?: string;
  anyPermission?: string[];
}

export const HELP_CONTENT: Record<string, HelpEntry> = {
  eleves: {
    id: "eleves",
    title: "Élèves",
    tips: [
      "La recherche fonctionne par matricule, nom, prénom, téléphone d'un responsable ou date de naissance (AAAA-MM-JJ) — pas besoin de taper le nom complet.",
      "Pour voir les élèves regroupés classe par classe plutôt qu'en une seule liste, utilisez « Élèves par classe » dans le menu.",
      "Un élève apparaît ici dès sa création, même sans inscription encore validée pour l'année en cours.",
      "Les boutons Excel et PDF exportent exactement la liste affichée, recherche comprise.",
    ],
    permission: "STUDENT_READ",
  },
  "eleves-inscription": {
    id: "eleves-inscription",
    title: "Nouvelle inscription / réinscription",
    tips: [
      "Un seul assistant pour les deux cas : si l'élève existe déjà, choisissez « Élève déjà connu » et recherchez-le — le système détermine seul s'il s'agit d'une inscription ou d'une réinscription.",
      "Le matricule est généré automatiquement à la création — jamais besoin de l'inventer ou de le deviner.",
      "Si un élève très proche existe déjà (même nom, prénom et date de naissance), une alerte de doublon apparaît avant de valider : vérifiez avant de confirmer « Ce n'est pas un doublon ».",
      "La facture (frais d'inscription ou de réinscription, pension en tranches) est générée automatiquement dès la confirmation — rien à saisir en plus.",
    ],
    permission: "ENROLLMENT_MANAGE",
  },
  tarifs: {
    id: "tarifs",
    title: "Tarifs & facturation",
    tips: [
      "Créez d'abord le « type de frais » (ex. Pension), puis seulement ensuite sa grille tarifaire par niveau et année — l'ordre inverse n'est pas possible.",
      "Cochez « Réparti en tranches » si le montant se paie en plusieurs échéances (ex. 3 tranches de pension) — sinon un seul montant sera demandé.",
      "« S'applique à » permet de réserver un frais aux nouveaux élèves (Inscription) ou aux élèves déjà connus (Réinscription) — laissez « Inscription et réinscription » sinon.",
      "Modifier un tarif existant ne change jamais les factures déjà émises (RG03) : les élèves déjà facturés gardent leur montant d'origine.",
    ],
    permission: "FEE_MANAGE",
  },
  "eleves-dossier-paiements": {
    id: "eleves-dossier-paiements",
    title: "Encaisser un paiement",
    tips: [
      "Le bouton « Payer » d'une ligne pré-remplit automatiquement le solde restant — modifiez le montant seulement pour un paiement partiel.",
      "Chaque paiement génère son propre reçu numéroté : pour deux frais différents (ex. inscription et pension), faites deux paiements distincts.",
      "« Réimprimer » ne recrée jamais un nouveau numéro de reçu — c'est exactement le même document.",
      "« Demander une remise » crée une demande en attente : seule la Direction peut l'approuver, jamais la personne qui encaisse.",
      "« Autre frais » sert à facturer un montant ponctuel (tenue, livre...) en plus de la facture habituelle.",
    ],
    permission: "PAYMENT_CREATE",
  },
  "vie-scolaire": {
    id: "vie-scolaire",
    title: "Vie scolaire",
    tips: [
      "Rien n'est préchargé volontairement : commencez par l'onglet « Suivi de la saisie », qui indique précisément ce qu'il reste à remplir.",
      "Ordre conseillé : Horaires (jours et créneaux) → Matières → Enseignants → Affectations (qui enseigne où) → Calendrier → Salles.",
      "Une affectation exige que la matière soit déjà cochée pour le niveau de la classe concernée — sinon elle n'apparaît pas dans la liste.",
      "La classe pilote et l'enseignant volontaire (en bas de « Suivi de la saisie ») servent à tester l'appel et le pointage avant un déploiement complet.",
    ],
    permission: "PEDAGOGY_MANAGE",
  },
  "tableau-de-bord": {
    id: "tableau-de-bord",
    title: "Tableau de bord",
    tips: [
      "Les chiffres reflètent toujours l'année scolaire active — changez d'année depuis « Années scolaires » si besoin.",
      "Cliquez sur un indicateur (effectif, finances...) pour ouvrir directement l'écran détaillé correspondant.",
      "« Rechercher un élève » va droit au dossier, sans passer par la liste complète.",
    ],
  },
  "eleves-par-classe": {
    id: "eleves-par-classe",
    title: "Élèves par classe",
    tips: [
      "Filtrez par classe ou recherchez un nom pour retrouver un élève dans une liste par ailleurs longue.",
      "Cliquez sur un élève pour ouvrir directement son dossier.",
      "Les exports Excel et PDF respectent le filtre et la recherche en cours, classe par classe.",
    ],
    permission: "STUDENT_READ",
  },
  "eleves-dossier": {
    id: "eleves-dossier",
    title: "Dossier élève",
    tips: [
      "« Fiche de synthèse (PDF) » réunit identité, finances, assiduité et notes en un seul document à imprimer.",
      "« Modifier » sur l'identité permet de corriger une erreur de saisie (nom, classe...) à tout moment.",
      "Chaque carte se développe ou se réduit indépendamment : ouvrez seulement celle dont vous avez besoin.",
      "La carte « Vie scolaire (discipline) » ne se charge qu'à l'ouverture — chaque consultation est journalisée, jamais en silence.",
    ],
    permission: "STUDENT_READ",
  },
  preinscriptions: {
    id: "preinscriptions",
    title: "Préinscriptions",
    tips: [
      "Accepter une demande crée réellement l'élève et son inscription — c'est vous qui choisissez la classe à ce moment-là, jamais la famille.",
      "Un doublon potentiel (même nom, prénom et date de naissance qu'un élève déjà connu) est signalé avant de confirmer.",
      "Refuser une demande exige un motif : la famille le voit ensuite sur sa page de suivi.",
    ],
    permission: "ENROLLMENT_MANAGE",
  },
  "emploi-du-temps": {
    id: "emploi-du-temps",
    title: "Emploi du temps",
    tips: [
      "Une nouvelle version repart par défaut d'une copie de la version en vigueur — cochez « vide » pour repartir de zéro.",
      "Un conflit (classe, enseignant ou salle à deux endroits en même temps) est refusé avec le nom de la séance en cause.",
      "Publier une version fige une date d'effet : la version publiée ne peut plus être modifiée ensuite.",
      "L'onglet « Semaine réelle » gère les changements ponctuels (annulation, remplacement) sans jamais toucher à la version publiée.",
    ],
    permission: "TIMETABLE_READ",
  },
  appel: {
    id: "appel",
    title: "Appel et absences",
    tips: [
      "Par défaut, tout le monde est présent : ne cochez que les absences et les retards.",
      "Un enseignant ne voit et ne modifie que l'appel de ses propres séances ; la vie scolaire et la Direction voient tout.",
      "Après la fin de la journée, seules la vie scolaire ou la Direction peuvent corriger un appel, avec un motif obligatoire.",
      "Un retard au-delà du seuil paramétré devient automatiquement une absence — pas besoin de le choisir soi-même.",
    ],
    anyPermission: ["ATTENDANCE_READ", "ATTENDANCE_TAKE"],
  },
  notes: {
    id: "notes",
    title: "Notes et bulletins",
    tips: [
      "Un enseignant ne saisit que les notes de ses propres matières et classes.",
      "Valider un trimestre fige les moyennes : l'enseignant ne peut plus rien changer, seule la Direction corrige ensuite, avec un motif.",
      "La publication est refusée tant qu'une note a été corrigée depuis la dernière validation.",
      "Un élève absent ou dispensé n'est jamais compté comme un zéro dans la moyenne.",
    ],
    anyPermission: ["GRADE_ENTER", "GRADE_READ"],
  },
  discipline: {
    id: "discipline",
    title: "Discipline",
    tips: [
      "Un enseignant ou un surveillant signale un incident ou une valorisation ; seule la Direction décide d'une sanction et la publie.",
      "Le parent ne voit une sanction qu'après sa publication — jamais avant.",
      "Les textes saisis ici restent confidentiels : une alerte externe reste toujours générique, jamais le détail.",
      "L'auteur corrige son signalement le jour même ; ensuite, seule la Direction le peut, avec un motif.",
    ],
    anyPermission: ["DISCIPLINE_REPORT", "DISCIPLINE_READ", "DISCIPLINE_DECIDE", "DISCIPLINE_CONVOKE"],
  },
  "cahier-de-textes": {
    id: "cahier-de-textes",
    title: "Cahier de textes",
    tips: [
      "Un enseignant ne saisit que pour ses propres classes et matières, mais peut lire tout le cahier des classes où il enseigne.",
      "Seul l'auteur d'une entrée peut la modifier ou la supprimer.",
      "Un devoir encore à rendre prévient les parents concernés (sans le détail) ; un simple contenu de séance ne déclenche aucune alerte.",
    ],
    anyPermission: ["TEXTBOOK_WRITE", "TEXTBOOK_READ"],
  },
  pointage: {
    id: "pointage",
    title: "Mon pointage",
    tips: [
      "Le type de scan (arrivée, départ, début ou fin de cours) est déterminé automatiquement par le serveur — jamais à choisir soi-même.",
      "Un scan répété à l'identique ne crée jamais de doublon.",
      "Fonctionne aussi sans Internet : le pointage part dès le retour de la connexion.",
    ],
    permission: "TEACHER_CHECKIN_SELF",
  },
  "pointage-enseignants": {
    id: "pointage-enseignants",
    title: "Pointage des enseignants",
    tips: [
      "Un pointage scanné reste « En attente » jusqu'à validation par un tiers — jamais par la personne concernée elle-même.",
      "Régénérer un QR code invalide immédiatement l'ancien, même s'il a déjà été imprimé.",
      "Les heures du mois ne comptent que les pointages validés.",
    ],
    permission: "TEACHER_CHECKIN_READ",
  },
  "portail-parents": {
    id: "portail-parents",
    title: "Comptes parents",
    tips: [
      "Un code d'activation ne s'affiche qu'une seule fois : notez-le ou imprimez-le tout de suite.",
      "Générer un nouveau code invalide l'ancien et ferme les sessions déjà ouvertes du responsable.",
      "Le retrait d'accès se fait enfant par enfant, jamais pour tous les enfants d'un responsable à la fois.",
    ],
    permission: "PARENT_ACCOUNT_MANAGE",
  },
  pilotage: {
    id: "pilotage",
    title: "Pilotage 360°",
    tips: [
      "Tout est recalculé à la demande depuis l'appel, les justificatifs et les pointages — rien n'est saisi sur cet écran.",
      "Les alertes de décrochage restent désactivées tant qu'aucun seuil n'est fixé (onglet Assiduité de Vie scolaire).",
      "Chaque export est journalisé : une liste nominative d'élèves quitte alors l'application.",
    ],
    permission: "PILOTAGE_READ",
  },
  messagerie: {
    id: "messagerie",
    title: "Messagerie",
    tips: [
      "Un enseignant n'écrit qu'aux responsables d'un élève dont il a la classe actuelle ; la vie scolaire et la Direction peuvent écrire à toute famille.",
      "Jamais de numéro de téléphone échangé : un message qui en contient un est refusé avant l'envoi.",
      "Seule la Direction peut superviser les conversations, et chaque ouverture est journalisée.",
    ],
    permission: "MESSAGE_USE",
  },
  annonces: {
    id: "annonces",
    title: "Annonces",
    tips: [
      "Un enseignant publie pour ses classes affectées seulement ; la vie scolaire et la Direction peuvent publier pour n'importe quelle classe.",
      "L'alerte envoyée aux parents reste générique — le contenu complet n'est visible que dans l'application.",
      "Retirer une annonce publiée l'indique clairement aux parents, sans jamais effacer la trace.",
    ],
    permission: "MESSAGE_USE",
  },
  insolvables: {
    id: "insolvables",
    title: "Élèves insolvables",
    tips: [
      "La liste se recalcule à chaque ouverture à partir des vraies factures et des vrais paiements — rien n'est saisi ici.",
      "Le lien téléphonique appelle directement le responsable prioritaire de l'élève.",
      "Un élève reste sur cette liste tant qu'au moins une échéance passée n'est pas entièrement couverte.",
    ],
    permission: "FINANCE_READ",
  },
  "paiements-en-ligne": {
    id: "paiements-en-ligne",
    title: "Paiements en ligne",
    tips: [
      "Un paiement encore « En attente » se vérifie avec le bouton dédié plutôt que d'attendre indéfiniment.",
      "« À traiter » signale un parent qui a payé une tranche déjà réglée entre-temps : remboursez-le hors de l'application avant de clôturer.",
      "Seule la Direction peut clôturer un paiement à traiter.",
    ],
    permission: "FINANCE_READ",
  },
  depenses: {
    id: "depenses",
    title: "Sorties financières",
    tips: [
      "Une sortie créée reste « En attente » tant que la Direction ne l'a pas approuvée — elle n'entre dans la clôture qu'une fois approuvée.",
      "La personne qui enregistre une sortie ne peut jamais l'approuver elle-même.",
      "Choisissez la catégorie la plus proche dans la liste proposée ; aucune catégorie libre n'est acceptée.",
    ],
    permission: "CASH_CLOSE",
  },
  cloture: {
    id: "cloture",
    title: "Clôture de journée",
    tips: [
      "Les chiffres sont recalculés à chaque ouverture, jamais enregistrés : aucune session à ouvrir ou à fermer.",
      "Une sortie financière encore en attente d'approbation n'apparaît jamais dans le solde du jour.",
      "Changez la date pour consulter la clôture d'un jour passé.",
    ],
    permission: "CASH_CLOSE",
  },
  "parametres-annees": {
    id: "parametres-annees",
    title: "Années scolaires",
    tips: [
      "Une seule année peut être active à la fois : activer une nouvelle année exige d'abord de clôturer l'ancienne.",
      "Une année clôturée ne peut plus être modifiée, y compris son calendrier.",
    ],
    permission: "SETTINGS_READ",
  },
  "parametres-structure": {
    id: "parametres-structure",
    title: "Structure académique",
    tips: [
      "Suivez l'ordre Section → Cycle → Niveau → Classe : chaque élément créé se sélectionne automatiquement pour enchaîner sur le suivant.",
      "Une classe est toujours liée à une année scolaire précise — créez l'année avant la classe si besoin.",
    ],
    permission: "SETTINGS_READ",
  },
  "parametres-utilisateurs": {
    id: "parametres-utilisateurs",
    title: "Utilisateurs & rôles",
    tips: [
      "Un compte désactivé perd l'accès immédiatement, sans attendre sa prochaine connexion.",
      "Certains droits (approbations, annulations) sont réservés à la Direction : personne ne peut se les attribuer à soi-même, y compris un administrateur.",
      "Réinitialiser un mot de passe force son changement à la prochaine connexion.",
    ],
    permission: "USER_MANAGE",
  },
  "parametres-etablissement": {
    id: "parametres-etablissement",
    title: "Établissement",
    tips: [
      "Le logo et la signature téléversés ici apparaissent sur les reçus et les documents officiels.",
      "Le nom du directeur et la ville sont obligatoires avant de pouvoir émettre une attestation de scolarité.",
    ],
    permission: "SETTINGS_READ",
  },
  "hors-ligne": {
    id: "hors-ligne",
    title: "Synchronisation",
    tips: [
      "Les saisies faites sans Internet restent ici jusqu'à leur envoi réel au serveur.",
      "« Réessayer » relance l'envoi tout de suite, sans attendre le retour automatique de la connexion.",
      "Un encaissement hors ligne obtient un reçu provisoire ; le reçu officiel n'existe qu'après la synchronisation.",
    ],
  },
  audit: {
    id: "audit",
    title: "Journal d'audit",
    tips: [
      "Le journal est en lecture seule : aucune action ni correction ne peut se faire depuis cet écran.",
      "Filtrez par élève, utilisateur ou période pour retrouver rapidement une action précise.",
      "Une réinitialisation de mot de passe indique seulement qu'elle a eu lieu, jamais l'ancien ni le nouveau mot de passe.",
    ],
    permission: "AUDIT_LOG_READ",
  },
  "liens-utiles": {
    id: "liens-utiles",
    title: "Liens utiles",
    tips: [
      "Copiez un lien ou partagez-le directement par WhatsApp depuis chaque carte.",
      "L'adresse du personnel est unique pour tous les rôles : chacun ne voit ensuite que ses propres outils après connexion.",
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
