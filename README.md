# Shakespeare Academy — logiciel de gestion scolaire

[![CI](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/ci.yml/badge.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/ci.yml)
[![Tests](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/tests.yml/badge.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/tests.yml)
[![Coverage](./docs/badges/coverage.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/coverage.yml)
[![Branch coverage](./docs/badges/branch-coverage.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/coverage.yml)
[![License: UNLICENSED](https://img.shields.io/badge/license-UNLICENSED-lightgrey.svg)](apps/api/package.json)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](apps/api/package.json)
[![Repo size](https://img.shields.io/github/repo-size/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy)
[![Last commit](https://img.shields.io/github/last-commit/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/commits/master)
[![Open PRs](https://img.shields.io/github/issues-pr/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/pulls)
[![Contributors](https://img.shields.io/github/contributors/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/graphs/contributors)
[![Outdated dependencies](./docs/badges/outdated.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/outdated.yml)
[![Stars](https://img.shields.io/github/stars/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/stargazers)
[![Latest release](https://img.shields.io/github/v/release/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/releases/latest)
[![Top language](https://img.shields.io/github/languages/top/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy)
[![Code size](https://img.shields.io/github/languages/code-size/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy)
[![Forks](https://img.shields.io/github/forks/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/forks)
[![Commit activity](https://img.shields.io/github/commit-activity/m/stevedjani-web/shakespeare-academy)](https://github.com/stevedjani-web/shakespeare-academy/commits/master)
[![Vulnerabilities](./docs/badges/vulnerabilities.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/vulnerabilities.yml)
[![PostgreSQL 16](https://img.shields.io/badge/postgresql-16-blue.svg)](docker-compose.yml)
[![README format: Markdown](https://img.shields.io/badge/readme-Markdown-informational.svg)](README.md)
[![File count](./docs/badges/file-count.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/file-count.yml)
[![Lines of code](./docs/badges/loc.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/loc.yml)
[![Commit count](./docs/badges/commit-count.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/commit-count.yml)
[![Average commit size](./docs/badges/avg-commit-size.svg)](https://github.com/stevedjani-web/shakespeare-academy/actions/workflows/avg-commit-size.yml)

Monolithe modulaire Next.js (`apps/web`) + NestJS (`apps/api`) + PostgreSQL/Prisma.
Contexte projet complet : voir [`CLAUDE.md`](./CLAUDE.md) et [`DECISIONS_PENDING.md`](./DECISIONS_PENDING.md).

## 1. Prérequis

- Node.js 22+ (version utilisée par les Dockerfiles et la CI — voir `.github/workflows/`)
- Docker Desktop (pour PostgreSQL en local)

## 2. Base de données

```bash
cp docker-compose.override.yml.example docker-compose.override.yml   # une seule fois
docker compose up -d academy-db
```

Démarre PostgreSQL sur le port `5544` (republié uniquement via l'override local, jamais en production), avec deux bases : `shakespeare_academy` (dev) et `shakespeare_academy_test` (e2e, créée automatiquement via `docker/init-test-db.sql`).

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
cp .env.local.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

Écrans des Lots 1 (connexion, paramétrage, utilisateurs/rôles, audit) et 2 (élèves, inscriptions) disponibles — voir `CLAUDE.md` pour le détail.

## 5. Déploiement

Déployé en production sur `https://academy.lobima.online` (web) / `https://api-academy.lobima.online` (API), sur le même VPS qu'un autre projet (Elyon) derrière son reverse-proxy Caddy existant — voir `CLAUDE.md §Déploiement production` pour l'architecture exacte (réseau Docker partagé, pièges rencontrés, procédure). `Dockerfile` dans `apps/api/` et `apps/web/`, `docker-compose.yml` à la racine (sûr par défaut — aucun port publié en dehors de l'override local). `.env.production.example` documente les variables requises pour un nouveau déploiement.

## 6. Structure

```
apps/
  api/     NestJS — auth, users, roles, school, academic-years, sections, cycles, levels, classes,
           students, enrollments
  web/     Next.js — connexion, tableau de bord, paramétrage, élèves/inscriptions
docs/      Cahier de cadrage source
docker-compose.yml                    Déploiement (dev et production)
docker-compose.override.yml.example   Overrides dev local uniquement (port DB, base de test)
.env.production.example               Variables requises pour un déploiement VPS
DECISIONS_PENDING.md Décisions métier non validées par l'école
```
