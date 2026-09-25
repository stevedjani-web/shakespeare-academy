import type { Metadata } from "next";

// Le titre de l'onglet reste fixe (les métadonnées sont lues côté serveur, avant que la langue de l'appareil soit connue).
export const metadata: Metadata = { title: "Politique de confidentialité / Privacy policy | Shakespeare Academy" };

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
