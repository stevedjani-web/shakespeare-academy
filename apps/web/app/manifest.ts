import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shakespeare Academy",
    short_name: "Shakespeare",
    description: "Gestion scolaire : élèves, inscriptions, paiements et reçus, même sans Internet.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f4",
    theme_color: "#2f2b78",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Élèves", url: "/eleves", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Synchronisation", url: "/hors-ligne", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
