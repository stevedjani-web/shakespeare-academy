import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serveur Node autonome pour la conteneurisation (Dockerfile) — sans ça,
  // l'image de production devrait embarquer node_modules en entier.
  output: "standalone",
};

export default nextConfig;
