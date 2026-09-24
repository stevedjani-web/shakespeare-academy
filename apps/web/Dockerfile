# Conteneurisation du web pour le déploiement VPS (ecole-shakespeare.com).

# ---------------------------------------------------------------------------
# Stage 1 : deps — installe les dépendances seules (couche cache réutilisable
# tant que package*.json ne change pas, même si le code source change).
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2 : builder — construit le bundle Next.js
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_API_URL est INLINÉE dans le bundle JavaScript CÔTÉ CLIENT au
# moment de `next build` — c'est le navigateur de l'utilisateur qui exécute
# ce code, jamais le serveur Next.js lui-même. La définir seulement comme
# variable d'environnement au runtime du conteneur ne changerait RIEN : le
# JavaScript est déjà généré et figé. Elle DOIT donc être un ARG de build,
# transformé en ENV *avant* `next build`, précisément ici.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 : runner — image finale, serveur Node autonome (output: standalone)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/login', (r) => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
