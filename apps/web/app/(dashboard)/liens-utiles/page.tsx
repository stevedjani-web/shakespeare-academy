"use client";

import { useState } from "react";
import { Copy, Check, MessageCircleMore } from "lucide-react";
import { Button, Card, PageTitle } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";

interface ActorLink {
  key: string;
  titre: MessageKey;
  description: MessageKey;
  chemin: string;
}

// Chaque acteur de l'application a un point d'entrée dédié — un seul par acteur, pas un par rôle :
// le personnel (Direction, secrétariat, comptabilité, surveillance ET enseignants) partage la même
// page de connexion, chacun n'y voyant ensuite que les écrans propres à sa permission (voir
// components/app-shell.tsx) — inventer une URL par rôle aurait été trompeur, il n'y en a réellement
// qu'une. Le guide d'utilisation est public : il figure ici aussi, pour être transmis tel quel.
const ACTOR_LINKS: ActorLink[] = [
  {
    key: "personnel",
    titre: "adm.links.staff.title",
    description: "adm.links.staff.desc",
    chemin: "/login",
  },
  {
    key: "parents",
    titre: "adm.links.parents.title",
    description: "adm.links.parents.desc",
    chemin: "/parents/connexion",
  },
  {
    key: "preinscription",
    titre: "adm.links.prereg.title",
    description: "adm.links.prereg.desc",
    chemin: "/preinscription",
  },
  {
    key: "guide",
    titre: "adm.links.guide.title",
    description: "adm.links.guide.desc",
    chemin: "/guide",
  },
];

function LinkRow({ link }: { link: ActorLink }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${link.chemin}`;

  async function copy() {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (permission refusée, navigation privée stricte) : l'adresse
      // reste affichée et sélectionnable à la main, jamais un blocage.
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${t(link.titre)} — ${t(link.description)}\n${url}`)}`;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-display text-base font-semibold text-ink">{t(link.titre)}</p>
        <p className="mt-1 text-sm text-ink-muted">{t(link.description)}</p>
      </div>
      <p className="truncate rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink" title={url}>
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t("adm.links.copied") : t("adm.links.copy")}
        </Button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="sa-interactive inline-flex items-center gap-2 rounded-full bg-success px-4 py-2.5 text-sm font-medium text-white"
        >
          <MessageCircleMore size={16} /> {t("adm.links.whatsapp")}
        </a>
      </div>
    </Card>
  );
}

export default function LiensUtilesPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageTitle
        subtitle={t("adm.links.subtitle")}
        helpId="liens-utiles"
      >
        {t("adm.links.title")}
      </PageTitle>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ACTOR_LINKS.map((link) => (
          <LinkRow key={link.key} link={link} />
        ))}
      </div>
    </div>
  );
}
