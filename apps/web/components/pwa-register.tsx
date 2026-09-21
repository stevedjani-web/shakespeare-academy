"use client";

import { useEffect } from "react";
import { startInstallWatch } from "@/lib/pwa-install";

// Enregistre le service worker (installation de l'application et ouverture sans Internet).
// Uniquement en production : en développement, les fichiers changent à chaque sauvegarde et une
// copie en cache servirait du code périmé.
export function PwaRegister() {
  useEffect(() => {
    startInstallWatch();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
