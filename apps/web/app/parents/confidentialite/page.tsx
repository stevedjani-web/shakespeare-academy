import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Politique de confidentialité, espace parents | Shakespeare Academy" };

// Version affichée au responsable au moment de l'activation : à garder identique à CONSENT_VERSION de l'API.
const VERSION = "2026-09-v1";

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
      "Pour chacun de vos enfants uniquement : sa classe, l'emploi du temps de sa classe, ses absences et retards avec l'état des justificatifs, sa situation financière (montants facturés, payés et restants) et la liste de ses paiements avec leurs numéros de reçu.",
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
    titre: "Sécurité",
    contenu: [
      "Les échanges avec cet espace sont chiffrés. Un code d'activation ne sert qu'une fois et expire. Après plusieurs mots de passe faux, le compte est bloqué quelques minutes. Vous pouvez demander à tout moment à l'école de désactiver votre compte.",
    ],
  },
  {
    titre: "Combien de temps",
    contenu: [
      "Les présences et les informations de l'année scolaire en cours sont conservées pendant cette année et l'année suivante, puis archivées. Ces durées peuvent être précisées par l'école.",
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
