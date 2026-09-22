"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Wallet,
  ShieldAlert,
  GraduationCap,
  Users2,
} from "lucide-react";
import { CopyrightFooter } from "@/components/copyright-footer";

type RoleKey = "direction" | "secretariat" | "surveillance" | "enseignant" | "parent";

interface RoleGuide {
  key: RoleKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  intro: string;
  sections: Array<{ titre: string; etapes: string[] }>;
}

// Page publique (aucun compte requis, comme /preinscription) : un mode d'emploi pour chaque acteur de
// l'application, avec le vocabulaire exact des écrans réels (mêmes libellés que components/app-shell.tsx
// et la nav de l'espace parents) — pour qu'un lecteur reconnaisse immédiatement l'écran décrit. Aucun
// détail sensible n'y figure (aucune donnée d'élève, aucun identifiant) : uniquement des explications
// d'usage, comme le formulaire de préinscription lui-même.
const ROLES: RoleGuide[] = [
  {
    key: "direction",
    label: "Direction",
    icon: Building2,
    intro:
      "La Direction valide les décisions sensibles (remises, sorties financières, annulations de paiement, bulletins, sanctions) et consulte la vue d'ensemble de l'école.",
    sections: [
      {
        titre: "Décisions à approuver",
        etapes: [
          "Une demande de remise (dossier de l'élève concerné, carte « Situation financière ») s'approuve ou se rejette avec « Approuver » / « Rejeter ».",
          "Une sortie financière (« Sorties financières ») s'approuve avant d'entrer dans la clôture de journée.",
          "Une annulation de paiement (« Annuler » sur un reçu) n'est possible que depuis un compte Direction.",
        ],
      },
      {
        titre: "Vie scolaire et discipline",
        etapes: [
          "« Notes et bulletins », onglet Bulletins : valider un trimestre fige les moyennes et rangs, publier le rend visible aux parents.",
          "« Discipline », onglet À traiter : décider d'une sanction sur un incident signalé, puis la publier pour qu'elle apparaisse au parent.",
          "« Messagerie », onglet Supervision : consulter (sans en modifier le contenu) les échanges entre enseignants et parents ; chaque ouverture est journalisée.",
        ],
      },
      {
        titre: "Pilotage et administration",
        etapes: [
          "« Pilotage 360° » : assiduité, ponctualité des enseignants et alertes de décrochage, recalculés en direct — aucune saisie propre à cet écran.",
          "« Utilisateurs & rôles » : créer un compte, lui attribuer un rôle, réinitialiser un mot de passe.",
          "« Liens utiles » et « Guide d'utilisation » (cette page) : à transmettre aux familles et au personnel.",
        ],
      },
    ],
  },
  {
    key: "secretariat",
    label: "Secrétariat & comptabilité",
    icon: Wallet,
    intro:
      "Le secrétariat inscrit les élèves, encaisse les paiements et gère les comptes parents ; la comptabilité enregistre les sorties et suit la clôture de journée.",
    sections: [
      {
        titre: "Élèves et inscriptions",
        etapes: [
          "« Élèves » : rechercher un élève par matricule, nom ou téléphone d'un responsable ; ouvrir son dossier.",
          "« Préinscriptions » : examiner les demandes reçues via le formulaire public, choisir une classe et « Accepter » pour créer l'élève et son inscription, ou « Rejeter » avec un motif.",
          "Depuis le dossier d'un élève, l'assistant « Nouvelle inscription » couvre à la fois une première inscription et une réinscription.",
        ],
      },
      {
        titre: "Paiements et reçus",
        etapes: [
          "Sur la carte « Situation financière » du dossier élève, bouton « Payer » sur la ligne concernée : montant, mode de paiement, référence si Mobile Money.",
          "Chaque paiement génère un reçu numéroté, imprimable et vérifiable par QR code ; « Réimprimer » le ressort à l'identique.",
          "« Paiements en ligne » : suivre les paiements initiés par les parents eux-mêmes depuis leur espace.",
        ],
      },
      {
        titre: "Comptes parents et sorties",
        etapes: [
          "« Comptes parents » : générer un code d'activation pour un responsable (ou toute une classe d'un coup), à lui remettre en main propre ou par lettre imprimée.",
          "« Sorties financières » : enregistrer une dépense (elle attend l'approbation de la Direction avant d'apparaître dans la clôture).",
          "« Clôture de journée » : entrées, sorties et solde du jour, recalculés à la demande.",
        ],
      },
    ],
  },
  {
    key: "surveillance",
    label: "Vie scolaire (surveillance)",
    icon: ShieldAlert,
    intro:
      "La vie scolaire fait l'appel quand l'enseignant ne le fait pas lui-même, traite les justificatifs, gère la discipline et valide le pointage des enseignants.",
    sections: [
      {
        titre: "Appel et absences",
        etapes: [
          "« Appel et absences » : choisir le jour et la classe, faire l'appel (tout le monde est présent par défaut, ne signaler que les exceptions).",
          "Une correction après la fin de la journée exige un motif, conservé dans l'historique.",
          "Onglet « Absences et justificatifs » : accepter ou refuser un justificatif déposé.",
        ],
      },
      {
        titre: "Discipline",
        etapes: [
          "Signaler un incident ou une valorisation depuis « Discipline » : classe, élève, description.",
          "Envoyer une convocation à une famille avec un motif et une date de rendez-vous.",
          "Le dossier de l'élève (carte « Vie scolaire ») garde l'historique complet, chaque ouverture y étant journalisée.",
        ],
      },
      {
        titre: "Pointage des enseignants",
        etapes: [
          "« Pointage enseignants » : valider ou rejeter les pointages du jour, saisir un pointage oublié avec un motif.",
          "Onglet « QR codes et règles » : afficher ou imprimer les QR codes des salles et de l'entrée à installer dans l'école.",
        ],
      },
    ],
  },
  {
    key: "enseignant",
    label: "Enseignant",
    icon: GraduationCap,
    intro:
      "Un enseignant se connecte avec le même écran que le reste du personnel. Il ne voit que ses propres classes et matières.",
    sections: [
      {
        titre: "Pointage",
        etapes: [
          "« Mon pointage » : scanner le QR code de la salle (ou de l'entrée, selon l'école) en arrivant et en repartant.",
          "Ouvrir directement un QR avec l'appareil photo du téléphone pointe automatiquement, y compris juste après une connexion.",
        ],
      },
      {
        titre: "Classe et pédagogie",
        etapes: [
          "« Appel et absences » : faire l'appel de ses propres séances, si l'école le lui confie.",
          "« Cahier de textes » : noter le contenu du cours et le travail à faire — visible aussitôt des parents.",
          "« Notes et bulletins » : saisir les notes de ses évaluations tant que le trimestre n'est pas validé par la Direction.",
          "« Discipline » : signaler un incident ou une valorisation pour un élève de l'une de ses classes.",
        ],
      },
    ],
  },
  {
    key: "parent",
    label: "Parent",
    icon: Users2,
    intro:
      "Un parent dispose de son propre espace, distinct de celui du personnel, accessible depuis « Espace parents ».",
    sections: [
      {
        titre: "Activation et connexion",
        etapes: [
          "Avec le code remis par le secrétariat, ouvrir « Espace parents » puis « Activer mon compte » : numéro de téléphone, code, mot de passe à choisir.",
          "Ensuite, se connecter avec ce même numéro et ce mot de passe.",
        ],
      },
      {
        titre: "Suivre ses enfants",
        etapes: [
          "La fiche de chaque enfant réunit emploi du temps, absences, notes et bulletins publiés, cahier de textes, discipline et documents.",
          "« Finances et reçus » : solde par tranche, historique des paiements, et paiement en ligne par Mobile Money quand l'école l'a activé.",
          "« Documents » : demander une attestation de scolarité directement depuis l'espace parents.",
        ],
      },
      {
        titre: "Messages et notifications",
        etapes: [
          "« Messages » : écrire à l'enseignant d'une classe de son enfant, ou au secrétariat de l'école.",
          "« Notifications » : activer les alertes sur son téléphone pour être prévenu d'une absence, d'un changement d'emploi du temps ou d'un nouveau message.",
        ],
      },
    ],
  },
];

export default function GuidePage() {
  const [active, setActive] = useState<RoleKey>("direction");
  const role = ROLES.find((r) => r.key === active)!;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-accent">
          S
        </span>
        <p className="font-display text-lg font-semibold text-ink">Shakespeare Academy</p>
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink">Guide d&apos;utilisation</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Choisissez votre rôle pour voir comment utiliser l&apos;application au quotidien.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className={`sa-interactive inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                active === r.key ? "bg-primary text-white" : "border border-border bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              <Icon size={16} /> {r.label}
            </button>
          );
        })}
      </div>

      <p className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm text-ink-muted">{role.intro}</p>

      <div className="mt-6 space-y-6">
        {role.sections.map((section) => (
          <div key={section.titre}>
            <h2 className="font-display text-base font-semibold text-ink">{section.titre}</h2>
            <ol className="mt-2 space-y-2">
              {section.etapes.map((etape, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{etape}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-primary underline">
          Connexion du personnel
        </Link>
        {" · "}
        <Link href="/parents/connexion" className="font-medium text-primary underline">
          Espace parents
        </Link>
      </p>
      <div className="mt-4">
        <CopyrightFooter />
      </div>
    </div>
  );
}
