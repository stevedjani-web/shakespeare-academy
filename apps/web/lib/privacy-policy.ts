import type { Locale } from "@/lib/i18n/locales";

// Version affichée au responsable au moment de l'activation : à garder identique à CONSENT_VERSION de l'API.
export const PRIVACY_VERSION = "2026-09-v8";

export interface PrivacySection {
  titre: string;
  contenu: string[];
}

export interface PrivacyPolicy {
  title: string;
  versionLine: string;
  back: string;
  sections: PrivacySection[];
}

// Les deux versions disent la même chose. Le texte anglais est une traduction de travail : comme le texte français, il doit
// être relu et validé par l'école ou un conseil juridique avant l'ouverture aux parents (D76).
const FR: PrivacyPolicy = {
  title: "Politique de confidentialité",
  versionLine: `Espace parents, version ${PRIVACY_VERSION}`,
  back: "Retour à l'espace parents",
  sections: [
    {
      titre: "Qui est responsable de ces informations",
      contenu: [
        "Shakespeare Academy, l'école de vos enfants, est responsable des informations affichées dans cet espace. Cet espace n'est destiné qu'aux responsables des élèves, pour suivre leurs enfants.",
      ],
    },
    {
      titre: "Ce que nous enregistrons sur votre compte",
      contenu: [
        "Votre numéro de téléphone, tel que vous l'avez donné à l'école, sert d'identifiant. Votre mot de passe est conservé sous une forme chiffrée : personne, pas même l'école, ne peut le lire.",
        "Nous gardons la date à laquelle vous avez accepté cette politique et la version acceptée, ainsi que la date de votre dernière connexion.",
      ],
    },
    {
      titre: "Ce que vous pouvez voir",
      contenu: [
        "Pour chacun de vos enfants uniquement : sa classe, l'emploi du temps de sa classe, ses absences et retards avec l'état des justificatifs, sa situation financière (montants facturés, payés et restants), la liste de ses paiements avec leurs numéros de reçu et ses bulletins de notes et le cahier de textes de sa classe (ce qui a été fait en cours et les devoirs à faire, écrits par les enseignants, sans fichier joint). Un bulletin n'apparaît qu'une fois validé puis publié par la Direction de l'école : vous ne voyez jamais les notes en cours de saisie.",
        "Dans l'onglet Vie scolaire : les sanctions décidées puis publiées par la Direction (nature, dates et, s'il existe, le message que l'école vous adresse), les convocations qui vous sont adressées, avec la possibilité d'indiquer que vous en avez pris connaissance, et les points positifs de votre enfant. Vous ne voyez jamais le récit des faits, le nom de l'enseignant qui a signalé, ni ce qui concerne un autre élève. Une sanction encore à l'étude n'est pas visible.",
        "Vous ne voyez jamais les informations d'un élève dont vous n'êtes pas responsable. Si l'école doit retirer votre accès à un enfant, il disparaît de votre espace.",
      ],
    },
    {
      titre: "Qui d'autre peut consulter ces informations",
      contenu: [
        "Le personnel de l'école y accède selon son rôle (secrétariat, vie scolaire, direction), pour faire son travail. Les actions sensibles, comme la remise d'un code d'activation ou le retrait d'un accès, sont enregistrées dans un journal.",
        "Le dossier de vie scolaire (faits signalés, sanctions, convocations) n'est lu que par la vie scolaire et la Direction ; un enseignant ne relit que les signalements qu'il a faits lui-même. Chaque ouverture du dossier d'un élève est enregistrée dans un journal, sans son contenu. Seule la Direction décide et publie une sanction.",
        "Ces informations ne sont ni vendues, ni utilisées pour de la publicité, ni transmises à d'autres organismes par cet espace.",
      ],
    },
    {
      titre: "Notifications",
      contenu: [
        "Vous êtes prévenu dans l'application des absences et retards de vos enfants, des cours annulés ou remplacés, des changements d'emploi du temps, des nouveaux messages, des annonces de classe, de la publication d'un bulletin, des devoirs donnés et d'un élément de vie scolaire (sanction publiée, convocation). Si vous activez les alertes sur votre téléphone, l'alerte donne seulement le prénom de l'enfant et vous renvoie vers l'application : jamais de motif, de note, de sanction ni de montant. Pour un message que son auteur a marqué urgent, l'alerte le dit (« message urgent ») sans jamais donner son contenu. Vous pouvez couper les alertes par type d'événement.",
      ],
    },
    {
      titre: "Paiement des frais en ligne",
      contenu: [
        "Si l'école a activé le paiement en ligne, vous pouvez payer une tranche de scolarité par Mobile Money depuis cet espace. Pour cela, le numéro de téléphone que vous saisissez est transmis à notre prestataire de paiement (PawaPay) et à votre opérateur, avec le montant, uniquement pour effectuer le paiement. Votre code secret Mobile Money reste sur votre téléphone : l'école ne le voit jamais et ne conserve aucun numéro de carte.",
        "L'école conserve la trace de chaque tentative (montant, numéro débité, résultat) et le reçu de chaque paiement réussi, comme pour un paiement fait au secrétariat. Les frais du prestataire sont à la charge de l'école : vous payez exactement le montant de la tranche.",
      ],
    },
    {
      titre: "Messagerie et annonces",
      contenu: [
        "Vous pouvez écrire aux enseignants de la classe de votre enfant et à l'école. Vous ne pouvez jamais écrire à un autre parent, et personne ne peut vous écrire hors de ce cadre. Les messages sont du texte seulement, sans pièce jointe, et les numéros de téléphone ne s'y échangent pas.",
        "La Direction de l'école peut consulter les échanges de la messagerie, par exemple pour traiter un signalement ou vérifier un usage inapproprié. Chaque consultation est enregistrée dans un journal. Vous pouvez signaler un message reçu à la Direction. Un message n'est jamais supprimé : la Direction peut le retirer, et il n'est alors plus lisible pour vous, mais sa trace est conservée.",
        "L'école indique un délai de réponse indicatif, affiché dans la messagerie. Ce n'est pas un engagement.",
        "Chaque message peut être marqué Normal, Important ou Urgent par son auteur. Vous ne pouvez marquer vos messages que Normal ou Important : pour une urgence immédiate (santé, sécurité), appelez l'école. Le niveau est visible par les personnes qui lisent l'échange, y compris la Direction.",
      ],
    },
    {
      titre: "Aide à la rédaction des réponses (facultative)",
      contenu: [
        "Si l'école a activé cette aide, un membre du personnel qui vous répond peut demander à un outil d'intelligence artificielle de lui proposer un brouillon de réponse. Ce brouillon est toujours relu, corrigé et envoyé par la personne elle-même : aucune réponse ne part automatiquement et l'outil ne prend aucune décision (paiement, note, sanction, admission).",
        "Pour préparer ce brouillon, l'école transmet au prestataire de l'outil (Anthropic, États-Unis) le prénom de votre enfant, sa classe, le texte de votre échange et, selon le rôle de la personne qui répond, des informations que vous voyez déjà dans cet espace (emploi du temps de la semaine, devoirs, absences et retards récents, situation de paiement). Elle ne transmet jamais votre nom, votre numéro de téléphone, votre adresse e-mail, la date de naissance de votre enfant, ses notes ni les informations de vie scolaire (discipline).",
        "Ces informations ne servent qu'à rédiger le brouillon, selon les conditions d'usage du prestataire. L'école ne garde que le nombre d'appels et leur coût, jamais le texte du brouillon.",
      ],
    },
    {
      titre: "Sécurité",
      contenu: [
        "Les échanges avec cet espace sont chiffrés. Un code d'activation ne sert qu'une fois et expire. Après plusieurs mots de passe faux, le compte est bloqué quelques minutes. Vous pouvez demander à tout moment à l'école de désactiver votre compte.",
      ],
    },
    {
      titre: "Combien de temps",
      contenu: [
        "Les présences, les messages, les notifications, les informations de vie scolaire et celles de l'année scolaire en cours sont conservés pendant cette année et l'année suivante, puis archivés. Ces durées peuvent être précisées par l'école.",
      ],
    },
    {
      titre: "Vos droits",
      contenu: [
        "Vous pouvez demander au secrétariat de l'école de consulter, corriger ou supprimer les informations qui vous concernent, et de fermer votre compte. Si une information affichée dans cet espace vous semble fausse, signalez-la au secrétariat.",
      ],
    },
  ],
};

const EN: PrivacyPolicy = {
  title: "Privacy policy",
  versionLine: `Parents' area, version ${PRIVACY_VERSION}`,
  back: "Back to the parents' area",
  sections: [
    {
      titre: "Who is responsible for this information",
      contenu: [
        "Shakespeare Academy, your children's school, is responsible for the information shown in this area. This area is intended only for the parents and guardians of students, so that they can follow their children.",
      ],
    },
    {
      titre: "What we record about your account",
      contenu: [
        "Your phone number, as you gave it to the school, is used as your username. Your password is stored in encrypted form: nobody, not even the school, can read it.",
        "We keep the date on which you accepted this policy and the version you accepted, as well as the date of your last sign-in.",
      ],
    },
    {
      titre: "What you can see",
      contenu: [
        "For each of your children only: their class, the timetable of their class, their absences and late arrivals with the status of the notes, their fees situation (amounts invoiced, paid and outstanding), the list of their payments with receipt numbers, their report cards, and the lesson and homework log of their class (what was done in class and the homework to do, written by the teachers, with no attached file). A report card only appears once it has been approved and then published by the school management: you never see grades while they are being entered.",
        "In the School life tab: the sanctions decided and then published by the management (nature, dates and, if there is one, the message the school addresses to you), the summonses addressed to you, with the possibility of indicating that you have read them, and your child's positive points. You never see the account of the facts, the name of the teacher who reported them, or anything concerning another student. A sanction still under review is not visible.",
        "You never see the information of a student you are not responsible for. If the school has to withdraw your access to a child, that child disappears from your area.",
      ],
    },
    {
      titre: "Who else can see this information",
      contenu: [
        "School staff access it according to their role (school office, school life office, management) in order to do their work. Sensitive actions, such as issuing an activation code or withdrawing access, are recorded in a log.",
        "The school life file (reported incidents, sanctions, summonses) is read only by the school life office and the management; a teacher only re-reads the reports they made themselves. Each time a student's file is opened, this is recorded in a log, without its content. Only the management decides on and publishes a sanction.",
        "This information is neither sold, nor used for advertising, nor passed on to other organisations through this area.",
      ],
    },
    {
      titre: "Notifications",
      contenu: [
        "You are notified in the app of your children's absences and late arrivals, cancelled or replaced lessons, timetable changes, new messages, class announcements, the publication of a report card, homework given and school life items (published sanction, summons). If you turn on alerts on your phone, the alert only gives the child's first name and sends you to the app: never a reason, a grade, a sanction or an amount. For a message that its author has marked urgent, the alert says so (“urgent message”) without ever giving its content. You can turn off alerts for each type of event.",
      ],
    },
    {
      titre: "Paying fees online",
      contenu: [
        "If the school has enabled online payment, you can pay a school fee instalment by Mobile Money from this area. To do so, the phone number you enter is passed to our payment provider (PawaPay) and to your operator, with the amount, solely to carry out the payment. Your Mobile Money secret code stays on your phone: the school never sees it and keeps no card number.",
        "The school keeps a record of each attempt (amount, number debited, result) and the receipt of each successful payment, as for a payment made at the school office. The provider's fees are borne by the school: you pay exactly the amount of the instalment.",
      ],
    },
    {
      titre: "Messages and announcements",
      contenu: [
        "You can write to the teachers of your child's class and to the school. You can never write to another parent, and nobody can write to you outside this framework. Messages are text only, with no attachments, and phone numbers are not exchanged in them.",
        "The school management can read the conversations in the messaging, for example to handle a report or to check for inappropriate use. Each time this is done, it is recorded in a log. You can report a message you received to the management. A message is never deleted: the management can withdraw it, in which case it is no longer readable for you, but a trace of it is kept.",
        "The school shows an indicative reply time in the messaging. It is not a commitment.",
        "Each message can be marked Normal, Important or Urgent by its author. You can only mark your own messages Normal or Important: for an immediate emergency (health, safety), call the school. The level is visible to the people who read the conversation, including the management.",
      ],
    },
    {
      titre: "Help with writing replies (optional)",
      contenu: [
        "If the school has turned this help on, a member of staff replying to you can ask an artificial intelligence tool to suggest a draft reply. The draft is always read, corrected and sent by the person themselves: no reply is sent automatically and the tool makes no decision (payment, grade, sanction, admission).",
        "To prepare this draft, the school sends the tool's provider (Anthropic, United States) your child's first name, their class, the text of your conversation and, depending on the role of the person replying, information you already see in this area (this week's timetable, homework, recent absences and late arrivals, payment status). It never sends your name, your phone number, your email address, your child's date of birth, their grades or any school life (discipline) information.",
        "This information is only used to write the draft, under the provider's terms of use. The school only keeps the number of requests and their cost, never the text of the draft.",
      ],
    },
    {
      titre: "Security",
      contenu: [
        "Exchanges with this area are encrypted. An activation code can only be used once and expires. After several wrong passwords, the account is blocked for a few minutes. You can ask the school at any time to deactivate your account.",
      ],
    },
    {
      titre: "How long we keep it",
      contenu: [
        "Attendance, messages, notifications, school life information and information for the current school year are kept during that year and the following one, and then archived. The school may specify these periods.",
      ],
    },
    {
      titre: "Your rights",
      contenu: [
        "You can ask the school office to let you see, correct or delete the information that concerns you, and to close your account. If information shown in this area seems wrong to you, report it to the school office.",
      ],
    },
  ],
};

export function privacyPolicy(locale: Locale): PrivacyPolicy {
  return locale === "en" ? EN : FR;
}
