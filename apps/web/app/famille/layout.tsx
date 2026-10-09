import type { Metadata } from "next";

// Aperçu du lien quand il est partagé (WhatsApp, etc.) : un titre et une phrase qui disent à quoi sert la page, en français
// et en anglais (le lien circule dans des groupes bilingues). Les balises d'une page REMPLACENT celles du site au lieu de les
// compléter : l'image (logo de l'école, `app/opengraph-image.png`) doit donc être redéclarée ici.
const IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Shakespeare Academy" };

export const metadata: Metadata = {
  title: "Dossier de votre enfant · Shakespeare Academy",
  description: "Complétez le dossier de votre enfant en 2 minutes, depuis votre téléphone. · Complete your child's file in 2 minutes, from your phone.",
  openGraph: {
    type: "website",
    siteName: "Shakespeare Academy",
    locale: "fr_FR",
    title: "Dossier de votre enfant · Shakespeare Academy",
    description: "Complétez le dossier de votre enfant en 2 minutes, depuis votre téléphone. · Complete your child's file in 2 minutes, from your phone.",
    images: [IMAGE],
  },
  twitter: { card: "summary_large_image", title: "Dossier de votre enfant · Shakespeare Academy", description: "Complétez le dossier de votre enfant en 2 minutes, depuis votre téléphone. · Complete your child's file in 2 minutes, from your phone.", images: [IMAGE.url] },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
