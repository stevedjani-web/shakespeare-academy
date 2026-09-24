# Conteneurisation de l'API pour le déploiement VPS (api.ecole-shakespeare.com).

# ---------------------------------------------------------------------------
# Stage 1 : builder — compile le code et génère le client Prisma
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# openssl requis par le moteur Prisma sur une base Alpine (musl) — sans ça,
# le client Prisma échoue silencieusement au runtime alors qu'il fonctionne
# en dev sur une base Debian/Ubuntu (glibc), qui l'a déjà nativement.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 : production — image finale, sans les outils de build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

# Le client Prisma généré (stage builder) est copié PAR-DESSUS le
# node_modules fraîchement installé — jamais régénéré ici, pour rester
# strictement identique à ce qui a été construit et testé au stage builder.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist

# schema.prisma ET migrations/ sont nécessaires à `prisma migrate deploy` au
# démarrage — schema.prisma seul ne suffit pas, c'est le dossier migrations/
# qui contient ce qui est réellement appliqué à la base.
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

EXPOSE 3001

# /health n'a aucun guard (route publique de santé, voir app.controller.ts) —
# jamais un endpoint protégé, qui marquerait le conteneur "unhealthy" en
# permanence même quand l'API fonctionne (piège déjà rencontré et documenté
# sur le projet Elyon avec /tenants).
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# migrate deploy (jamais migrate dev, interactif et pensé pour le
# développement) AVANT de démarrer le serveur — une commande créée sur un
# schéma pas encore migré serait pire qu'un démarrage qui échoue franchement.
#
# dist/src/main.js, pas dist/main.js : tsconfig.json ne fixe pas `rootDir`,
# et la compilation couvre à la fois src/ et prisma/ (voir seed.ts) — tsc
# calcule alors une racine commune et préserve la structure src/ sous dist/
# (constaté en déployant réellement : le conteneur démarrait après une
# migration réussie puis échouait avec MODULE_NOT_FOUND sur dist/main.js).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
