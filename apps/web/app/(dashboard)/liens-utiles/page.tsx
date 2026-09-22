"use client";

import { useState } from "react";
import { Copy, Check, MessageCircleMore } from "lucide-react";
import { Button, Card, PageTitle } from "@/components/ui";

interface ActorLink {
  key: string;
  titre: string;
  description: string;
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
    titre: "Personnel de l'école",
    description:
      "Connexion de l'ensemble du personnel — Direction, secrétariat, comptabilité, surveillance et enseignants. Chacun n'y voit que les écrans propres à son rôle.",
    chemin: "/login",
  },
  {
    key: "parents",
    titre: "Espace parents",
    description:
      "Suivi de l'emploi du temps, des absences, des notes, de la situation financière et des documents de leurs enfants. Un compte s'active avec le code remis par le secrétariat.",
    chemin: "/parents/connexion",
  },
  {
    key: "preinscription",
    titre: "Préinscription en ligne",
    description:
      "Formulaire public pour qu'une famille dépose une demande de préinscription, sans compte. Le secrétariat l'examine ensuite dans « Préinscriptions ».",
    chemin: "/preinscription",
  },
  {
    key: "guide",
    titre: "Guide d'utilisation",
    description: "Explique, pour chaque acteur, comment utiliser l'application au quotidien. Public, sans compte requis.",
    chemin: "/guide",
  },
];

function LinkRow({ link }: { link: ActorLink }) {
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

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${link.titre} — ${link.description}\n${url}`)}`;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-display text-base font-semibold text-ink">{link.titre}</p>
        <p className="mt-1 text-sm text-ink-muted">{link.description}</p>
      </div>
      <p className="truncate rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink" title={url}>
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Lien copié" : "Copier le lien"}
        </Button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="sa-interactive inline-flex items-center gap-2 rounded-full bg-success px-4 py-2.5 text-sm font-medium text-white"
        >
          <MessageCircleMore size={16} /> Partager via WhatsApp
        </a>
      </div>
    </Card>
  );
}

export default function LiensUtilesPage() {
  return (
    <div>
      <PageTitle subtitle="Les adresses à transmettre à chaque acteur de l'école — famille, enseignant ou membre du personnel.">
        Liens utiles
      </PageTitle>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ACTOR_LINKS.map((link) => (
          <LinkRow key={link.key} link={link} />
        ))}
      </div>
    </div>
  );
}
