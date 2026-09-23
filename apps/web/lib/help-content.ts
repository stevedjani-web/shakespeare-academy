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
};

/** Liste ordonnée pour l'affichage sur /aide (l'ordre du menu, pas l'ordre alphabétique des clés). */
export const HELP_ORDER = ["eleves", "eleves-inscription", "eleves-dossier-paiements", "tarifs", "vie-scolaire"];
