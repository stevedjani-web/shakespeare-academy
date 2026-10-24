import type { Metadata } from "next";

// Aperçu du lien quand il est partagé (WhatsApp, etc.) : un titre et une phrase qui disent à quoi sert la page, en français
// et en anglais (le groupe est mixte). Les balises d'une page REMPLACENT celles du site : l'image doit être redéclarée ici.
const IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Shakespeare Academy" };
const TITLE = "Mes informations d'enseignant · Shakespeare Academy";
const DESCRIPTION = "Complétez votre dossier en 2 minutes, depuis votre téléphone. · Complete your file in 2 minutes, from your phone.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Shakespeare Academy", locale: "fr_FR", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE.url] },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
