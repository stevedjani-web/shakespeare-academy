import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { AuthProvider } from "@/contexts/auth-context";
import { PwaRegister } from "@/components/pwa-register";
import { LocaleSync } from "@/components/locale-sync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif éditorial pour la marque/les titres — évoque le prestige académique
// (« Shakespeare Academy ») sans tomber dans le générique Tailwind par défaut.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
  style: ["normal", "italic"],
});

// Adresse publique du site : sert à écrire en entier l'adresse de l'image d'aperçu des liens partagés (WhatsApp, Facebook,
// Telegram… exigent une adresse complète). L'image elle-même est `app/opengraph-image.png` (logo de l'école, 1200 x 630).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ecole-shakespeare.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Shakespeare Academy",
  description: "Logiciel de gestion scolaire — Shakespeare Academy",
  applicationName: "Shakespeare Academy",
  openGraph: {
    type: "website",
    siteName: "Shakespeare Academy",
    title: "Shakespeare Academy",
    description: "Logiciel de gestion scolaire — Shakespeare Academy",
    locale: "fr_FR",
  },
  twitter: { card: "summary_large_image", title: "Shakespeare Academy", description: "Logiciel de gestion scolaire — Shakespeare Academy" },
  appleWebApp: { capable: true, title: "Shakespeare", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2f2b78",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-(--color-bg) text-(--color-ink)">
        <LocaleSync />
        <PwaRegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
