# Shakespeare Academy — logiciel de gestion scolaire

Monolithe modulaire Next.js (`apps/web`) + NestJS (`apps/api`) + PostgreSQL/Prisma.
Contexte projet complet : voir [`CLAUDE.md`](./CLAUDE.md) et [`DECISIONS_PENDING.md`](./DECISIONS_PENDING.md).

## 1. Prérequis

- Node.js 20+
- Docker Desktop (pour PostgreSQL en local)

## 2. Base de données

```bash
docker compose up -d db
```

Démarre PostgreSQL sur le port `5544`, avec deux bases : `shakespeare_academy` (dev) et `shakespeare_academy_test` (e2e, créée automatiquement via `docker/init-test-db.sql`).

## 3. API (`apps/api`)

```bash
cd apps/api
cp .env.example .env      # à ajuster si besoin
npm install
npm run db:migrate        # applique les migrations Prisma sur la base de dev
npm run db:seed           # crée l'établissement, les rôles/permissions et un compte administrateur
npm run start:dev         # démarre l'API sur http://localhost:3001
```

Compte administrateur créé par le seed : `admin@shakespeareacademy.cg` / `ChangeMe123!` (à changer immédiatement — le compte est créé avec `doitChangerMotDePasse: true`).

### Tests

```bash
npm run build              # compilation TypeScript stricte
npm run lint                # ESLint
npm run test:e2e            # suite e2e (Jest + Supertest) contre shakespeare_academy_test
```

La suite e2e lit `.env.test` (base de test dédiée, jamais la base de dev) et s'exécute en série (`--runInBand`) : plusieurs fichiers de test partagent la même base, une exécution parallèle provoquerait des collisions.

Avant la première exécution des tests, appliquer les migrations sur la base de test :

```bash
DATABASE_URL="postgresql://shakespeare:shakespeare@localhost:5544/shakespeare_academy_test?schema=public" npx prisma migrate deploy
```

(à refaire après chaque nouvelle migration Prisma).

## 4. Web (`apps/web`)

```bash
cd apps/web
npm install
npm run dev                 # http://localhost:3000
```

Aucune page métier n'est encore construite (Lot 1 = backend uniquement, voir `CLAUDE.md`).

## 5. Structure

```
apps/
  api/     NestJS — auth, users, roles, school, academic-years, sections, cycles, levels, classes
  web/     Next.js (scaffold, pas encore de pages métier)
docs/      Cahier de cadrage source
docker-compose.yml   PostgreSQL (dev + test)
DECISIONS_PENDING.md Décisions métier non validées par l'école
```
