import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Politique de confidentialité, espace parents | Shakespeare Academy" };

// Version affichée au responsable au moment de l'activation : à garder identique à CONSENT_VERSION de l'API.
const VERSION = "2026-09-v5";

const SECTIONS: Array<{ titre: string; contenu: string[] }> = [
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
      "Vous ne voyez jamais les informations d'un élève dont vous n'êtes pas responsable. Si l'école doit retirer votre accès à un enfant, il disparaît de votre espace.",
    ],
  },
  {
    titre: "Qui d'autre peut consulter ces informations",
    contenu: [
      "Le personnel de l'école y accède selon son rôle (secrétariat, vie scolaire, direction), pour faire son travail. Les actions sensibles, comme la remise d'un code d'activation ou le retrait d'un accès, sont enregistrées dans un journal.",
      "Ces informations ne sont ni vendues, ni utilisées pour de la publicité, ni transmises à d'autres organismes par cet espace.",
    ],
  },
  {
    titre: "Notifications",
    contenu: [
      "Vous êtes prévenu dans l'application des absences et retards de vos enfants, des cours annulés ou remplacés, des changements d'emploi du temps, des nouveaux messages, des annonces de classe et de la publication d'un bulletin et des devoirs donnés. Si vous activez les alertes sur votre téléphone, l'alerte donne seulement le prénom de l'enfant et vous renvoie vers l'application : jamais de motif, de note ni de montant. Vous pouvez couper les alertes par type d'événement.",
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
      "Les présences, les messages, les notifications et les informations de l'année scolaire en cours sont conservés pendant cette année et l'année suivante, puis archivés. Ces durées peuvent être précisées par l'école.",
    ],
  },
  {
    titre: "Vos droits",
    contenu: [
      "Vous pouvez demander au secrétariat de l'école de consulter, corriger ou supprimer les informations qui vous concernent, et de fermer votre compte. Si une information affichée dans cet espace vous semble fausse, signalez-la au secrétariat.",
    ],
  },
];

export default function ParentPrivacyPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Politique de confidentialité</h1>
      <p className="mt-1 text-sm text-ink-muted">Espace parents, version {VERSION}</p>
      <div className="mt-5 space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.titre} className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">{s.titre}</h2>
            {s.contenu.map((p) => (
              <p key={p} className="mb-2 text-sm leading-relaxed text-ink last:mb-0">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-5 text-sm">
        <Link href="/parents" className="font-medium text-primary underline">
          Retour à l&apos;espace parents
        </Link>
      </p>
    </div>
  );
}
