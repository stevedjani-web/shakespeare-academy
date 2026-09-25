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
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";

type RoleKey = "direction" | "secretariat" | "surveillance" | "enseignant" | "parent";

interface RoleGuide {
  key: RoleKey;
  label: MessageKey;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  intro: MessageKey;
  sections: Array<{ titre: MessageKey; etapes: MessageKey[] }>;
}

// Page publique (aucun compte requis, comme /preinscription) : un mode d'emploi pour chaque acteur de
// l'application, avec le vocabulaire exact des écrans réels (mêmes libellés que components/app-shell.tsx
// et la nav de l'espace parents) — pour qu'un lecteur reconnaisse immédiatement l'écran décrit. Aucun
// détail sensible n'y figure (aucune donnée d'élève, aucun identifiant) : uniquement des explications
// d'usage, comme le formulaire de préinscription lui-même. Les textes sont des CLÉS du dictionnaire
// (`cnt.guide.*`), résolues à l'affichage dans la langue courante.
const ROLES: RoleGuide[] = [
  {
    key: "direction",
    label: "cnt.guide.direction.label",
    icon: Building2,
    intro: "cnt.guide.direction.intro",
    sections: [
      {
        titre: "cnt.guide.direction.s1.t",
        etapes: ["cnt.guide.direction.s1.e1", "cnt.guide.direction.s1.e2", "cnt.guide.direction.s1.e3"],
      },
      {
        titre: "cnt.guide.direction.s2.t",
        etapes: ["cnt.guide.direction.s2.e1", "cnt.guide.direction.s2.e2", "cnt.guide.direction.s2.e3"],
      },
      {
        titre: "cnt.guide.direction.s3.t",
        etapes: ["cnt.guide.direction.s3.e1", "cnt.guide.direction.s3.e2", "cnt.guide.direction.s3.e3"],
      },
    ],
  },
  {
    key: "secretariat",
    label: "cnt.guide.secretariat.label",
    icon: Wallet,
    intro: "cnt.guide.secretariat.intro",
    sections: [
      {
        titre: "cnt.guide.secretariat.s1.t",
        etapes: ["cnt.guide.secretariat.s1.e1", "cnt.guide.secretariat.s1.e2", "cnt.guide.secretariat.s1.e3"],
      },
      {
        titre: "cnt.guide.secretariat.s2.t",
        etapes: ["cnt.guide.secretariat.s2.e1", "cnt.guide.secretariat.s2.e2", "cnt.guide.secretariat.s2.e3"],
      },
      {
        titre: "cnt.guide.secretariat.s3.t",
        etapes: ["cnt.guide.secretariat.s3.e1", "cnt.guide.secretariat.s3.e2", "cnt.guide.secretariat.s3.e3"],
      },
    ],
  },
  {
    key: "surveillance",
    label: "cnt.guide.surveillance.label",
    icon: ShieldAlert,
    intro: "cnt.guide.surveillance.intro",
    sections: [
      {
        titre: "cnt.guide.surveillance.s1.t",
        etapes: ["cnt.guide.surveillance.s1.e1", "cnt.guide.surveillance.s1.e2", "cnt.guide.surveillance.s1.e3"],
      },
      {
        titre: "cnt.guide.surveillance.s2.t",
        etapes: ["cnt.guide.surveillance.s2.e1", "cnt.guide.surveillance.s2.e2", "cnt.guide.surveillance.s2.e3"],
      },
      {
        titre: "cnt.guide.surveillance.s3.t",
        etapes: ["cnt.guide.surveillance.s3.e1", "cnt.guide.surveillance.s3.e2"],
      },
    ],
  },
  {
    key: "enseignant",
    label: "cnt.guide.enseignant.label",
    icon: GraduationCap,
    intro: "cnt.guide.enseignant.intro",
    sections: [
      {
        titre: "cnt.guide.enseignant.s1.t",
        etapes: ["cnt.guide.enseignant.s1.e1", "cnt.guide.enseignant.s1.e2"],
      },
      {
        titre: "cnt.guide.enseignant.s2.t",
        etapes: [
          "cnt.guide.enseignant.s2.e1",
          "cnt.guide.enseignant.s2.e2",
          "cnt.guide.enseignant.s2.e3",
          "cnt.guide.enseignant.s2.e4",
        ],
      },
    ],
  },
  {
    key: "parent",
    label: "cnt.guide.parent.label",
    icon: Users2,
    intro: "cnt.guide.parent.intro",
    sections: [
      {
        titre: "cnt.guide.parent.s1.t",
        etapes: ["cnt.guide.parent.s1.e1", "cnt.guide.parent.s1.e2"],
      },
      {
        titre: "cnt.guide.parent.s2.t",
        etapes: ["cnt.guide.parent.s2.e1", "cnt.guide.parent.s2.e2", "cnt.guide.parent.s2.e3"],
      },
      {
        titre: "cnt.guide.parent.s3.t",
        etapes: ["cnt.guide.parent.s3.e1", "cnt.guide.parent.s3.e2"],
      },
    ],
  },
];

export default function GuidePage() {
  const { t } = useI18n();
  const [active, setActive] = useState<RoleKey>("direction");
  const role = ROLES.find((r) => r.key === active)!;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-accent">
          S
        </span>
        <p className="font-display text-lg font-semibold text-ink">Shakespeare Academy</p>
        <LanguageSwitcher className="ml-auto" />
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink">{t("nav.guide")}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("cnt.guide.subtitle")}</p>

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
              <Icon size={16} /> {t(r.label)}
            </button>
          );
        })}
      </div>

      <p className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm text-ink-muted">{t(role.intro)}</p>

      <div className="mt-6 space-y-6">
        {role.sections.map((section) => (
          <div key={section.titre}>
            <h2 className="font-display text-base font-semibold text-ink">{t(section.titre)}</h2>
            <ol className="mt-2 space-y-2">
              {section.etapes.map((etape, i) => (
                <li key={etape} className="flex gap-3 text-sm text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t(etape)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-primary underline">
          {t("cnt.guide.staffLogin")}
        </Link>
        {" · "}
        <Link href="/parents/connexion" className="font-medium text-primary underline">
          {t("parent.nav.space")}
        </Link>
      </p>
      <div className="mt-4">
        <CopyrightFooter />
      </div>
    </div>
  );
}
