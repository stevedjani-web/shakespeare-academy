# Shakespeare Academy — contexte projet

Document de référence complet : `docs/Shakespeare_Academy_Cahier_de_Cadrage_v1.0.docx`.
**En cas de doute ou de divergence, ce cahier de cadrage fait foi — pas cette page, qui n'en est qu'un résumé opérationnel.**
Décisions métier encore non validées par l'école : `DECISIONS_PENDING.md` — ne jamais inventer une valeur pour un point qui y figure comme `OUVERT`.

## Doctrine

Critère central de réussite : sécuriser toute la chaîne de l'inscription à la clôture journalière, avec une traçabilité financière totale. Une opération financière validée n'est **jamais** modifiée ni supprimée : toute correction passe par une annulation contrôlée et une contre-écriture (RG09, RG18).

Avant d'ajouter une fonctionnalité, se demander : *est-elle nécessaire pour sécuriser l'inscription, la facturation, l'encaissement ou la clôture d'un élève, sans ressaisie ni incohérence ?* Si non, elle n'est pas prioritaire (cf. §1.2 du cadrage, hors périmètre initial : notes, emplois du temps, cantine, transport, paie, portail parent, mobile money, appli mobile).

## Règles non négociables (voir cadrage §5 pour le détail complet)

- **RG01** — Un élève a un matricule permanent et une seule inscription active par année scolaire.
- **RG02** — Une classe appartient à un niveau, une section et une année scolaire.
- **RG03** — Les frais sont versionnés par année scolaire ; modifier un tarif ne modifie jamais les factures déjà émises.
- **RG08** — Un trop-perçu est interdit (sauf compte d'avance explicitement activé — non activé au MVP).
- **RG09** — Une transaction validée est immuable. L'annulation crée une transaction inverse liée à l'originale.
- **RG10** — Les numéros de reçu sont uniques, séquentiels et générés côté serveur.
- **RG13** — La solvabilité est **calculée**, jamais saisie manuellement.
- **RG15** — Toutes les actions sensibles sont journalisées (utilisateur, horodatage, ancienne/nouvelle valeur) — voir `AuditService` (`apps/api/src/audit/`), append-only par conception.
- **RG16** — Les montants XAF sont des entiers, aucun calcul financier en flottant.
- **RG18** — Aucune suppression physique d'élève, inscription, facture ou transaction en production.
- **Permissions fines, jamais par rôle seul** (§3, §14) : chaque action sensible est gardée par une permission précise (`@RequirePermission('CODE')`), vérifiée côté serveur même pour un appel API direct — masquer un bouton côté client n'est jamais une sécurité.
- **Le Secrétaire-caissier ne valide jamais ses propres annulations, remises exceptionnelles ou écarts de caisse** — seule la Direction approuve (à construire au Lot 4).

## Ordre de développement (cadrage §17, détaillé dans le message de validation du plan)

0. Cadrage — décisions métier, nomenclatures, tarifs, formats de reçus (`DECISIONS_PENDING.md`).
1. **Socle** — auth, utilisateurs/rôles/permissions, années scolaires, structure académique. **FAIT, voir état actuel ci-dessous.**
2. Élèves, responsables, inscriptions et réinscriptions (sans paiement).
3. Tarifs, factures, trois tranches, remises, solvabilité calculée.
4. Caisse, paiements, reçus PDF, annulations, autres recettes.
5. Sorties financières, clôture de journée, rapports/exports.
6. Import initial, formation, pilote, sauvegarde, mise en production.

## Stack

Next.js (apps/web, scaffoldé — aucune page métier encore construite, le Lot 1 est backend uniquement, comme l'a été le socle multi-tenant d'Elyon) · NestJS 11 (apps/api) · PostgreSQL 16 / Prisma 6.19.3 (apps/api/prisma/schema.prisma) · Docker Compose (Postgres dev + test uniquement pour l'instant).

**Choix de version Prisma délibéré** : Prisma 7/8-rc introduisent une rupture majeure (plus d'URL dans `schema.prisma`, adapters obligatoires, `prisma.config.ts`) — jugée trop récente et complexe pour ce socle. Rester sur Prisma 6.x (LTS stable) tant qu'une raison concrète n'impose pas la migration.
**`@nestjs/config` et `@nestjs/jwt` fixés en version pré-ESM** (`4.0.4` et `11.0.2` respectivement, `--save-exact`) : leurs versions plus récentes (12.x) publient du pur ESM, incompatible avec la transformation CommonJS de `ts-jest` utilisée par la suite e2e (`Must use import to load ES Module`). Revoir seulement si toute la chaîne de test bascule vers un runner nativement ESM.

## État actuel du scaffold

- **Lot 1 (socle) fait et vérifié** : `apps/api` compile (`npm run build`), démarre (`npm run start:dev`) et sert du trafic réel — vérifié manuellement via `curl` (login réel, création de section réelle, token JWT valide) en plus des tests automatisés.
- `apps/api/prisma/schema.prisma` : uniquement les entités du Lot 1 — `School`, `AcademicYear`, `Section`/`Cycle`/`Level`/`Class`, `User`/`Role`/`Permission`/`RolePermission`, `RefreshToken`, `AuditLog`. Les entités de facturation/paiement/caisse (Lots 3-5) sont **volontairement absentes** : plusieurs règles dont elles dépendent restent `OUVERT` dans `DECISIONS_PENDING.md` (granularité des remises, gestion du trop-perçu, etc.) — les modéliser maintenant risquerait de figer une hypothèse fausse.
- **Mono-établissement, pas multi-tenant** : une seule ligne `School` existe. `schoolId` est présent sur les entités scopées (anticipation d'une extension multi-site future, cadrage §11) mais aucun mécanisme de sélection de tenant n'est construit — `SchoolService.getDefaultId()` (`apps/api/src/school/`) résout systématiquement l'unique établissement. Ne pas confondre avec le modèle multi-tenant d'Elyon (autre projet, header `x-tenant-id`) : ici, il n'y a qu'un seul restaurant... pardon, une seule école.
- **Auth** (`apps/api/src/auth/`) : JWT d'accès court (15 min par défaut, `JWT_ACCESS_TTL`) signé et vérifié côté serveur à chaque requête (`JwtAuthGuard` recharge l'utilisateur + permissions depuis la base à chaque appel, jamais depuis le payload du jeton — un compte désactivé ou un rôle modifié a un effet immédiat). Rafraîchissement via cookie `httpOnly` (`refresh_token`, scope `path=/auth`), rotation à chaque `POST /auth/refresh` (l'ancien jeton est révoqué). Mots de passe hachés Argon2id. Verrouillage après 5 échecs consécutifs (15 min, `MAX_TENTATIVES_CONNEXION`/`DUREE_VERROUILLAGE_MINUTES` dans `auth.service.ts` — décision technique de sécurité, pas une règle métier de l'école, donc non listée dans `DECISIONS_PENDING.md`). Récupération administrée (`PATCH /users/:id/reset-password`, `USER_MANAGE`) : jamais d'auto-inscription ni de lien de réinitialisation par e-mail.
- **Permissions** (`apps/api/src/roles/`) : catalogue de 6 permissions Lot 1 (`SETTINGS_MANAGE`, `USER_MANAGE`, `ROLE_MANAGE`, `ACADEMIC_YEAR_MANAGE`, `ACADEMIC_STRUCTURE_MANAGE`, `AUDIT_LOG_READ`) — **volontairement incomplet** : les codes cités en exemple par le cadrage §3 (`PAYMENT_CREATE`, `PAYMENT_CANCEL_APPROVE`, `CASH_CLOSE`, `EXPENSE_CREATE`) seront ajoutés à `prisma/seed-data.ts` au fur et à mesure que leurs modules (Lots 3-5) seront construits, jamais avant qu'une route ne les vérifie réellement. 5 rôles seedés conformes au tableau du cadrage §3 (`ADMINISTRATEUR`, `DIRECTION`, `SECRETAIRE_CAISSIER`, `COMPTABLE`, `AUDITEUR`) — `SECRETAIRE_CAISSIER`/`COMPTABLE` n'ont encore aucune permission assignée (leur domaine n'existe pas avant les Lots 2-5). `GET /roles`/`GET /permissions` sont lisibles par tout utilisateur authentifié (nécessaire pour peupler un sélecteur de rôle) ; seules les mutations exigent `ROLE_MANAGE`.
- **Structure académique** (`apps/api/src/{sections,cycles,levels,classes}/`) : hiérarchie `Section → Cycle → Level → Class` conforme au modèle recommandé du cadrage §2. Lecture ouverte à tout utilisateur authentifié, écriture derrière `ACADEMIC_STRUCTURE_MANAGE`. `Class.serie`/`Class.groupe` : colonnes prévues par anticipation de la décision D02 (séries de lycée, sous-groupes), non exploitées tant qu'elle reste ouverte.
- **Années scolaires** (`apps/api/src/academic-years/`) : statuts `BROUILLON`/`ACTIVE`/`CLOTUREE`. Une seule année `ACTIVE` à la fois — **activer une nouvelle année échoue explicitement s'il en existe déjà une active** (jamais de bascule automatique silencieuse ; la Direction doit d'abord clôturer l'ancienne). Une année `CLOTUREE` ne peut plus être modifiée.
- **Audit** (`apps/api/src/audit/`) : `AuditService.log()` est **append-only par conception** (aucune méthode de mise à jour/suppression exposée). Sérialise automatiquement les valeurs Prisma (dates comprises) en JSON — jamais besoin de sérialiser soi-même côté appelant. Ne journalise **jamais** un hash de mot de passe, ni avant ni après une réinitialisation. `GET /audit-logs` derrière `AUDIT_LOG_READ`, filtrable par utilisateur/entité/période.
- **Établissement** (`apps/api/src/school/`) : `GET /school` public à tout utilisateur connecté, `PATCH /school` derrière `SETTINGS_MANAGE`. `devise`/`fuseauHoraire` fixés par les exigences non fonctionnelles du cadrage (XAF, Africa/Brazzaville) — pas exposés en modification tant qu'aucun besoin réel de les changer n'apparaît.
- **Tests** : 39 tests e2e (Jest + Supertest, `apps/api/test/*.e2e-spec.ts`) contre une base Postgres dédiée (`shakespeare_academy_test`, jamais la base de dev) — auth (login/lockout/refresh/logout/changement de mot de passe), permissions fines (CA14 : refus serveur direct sans la permission requise), années scolaires (règle d'unicité de l'année active), structure académique (hiérarchie, doublons, filtres), utilisateurs (création/désactivation/réinitialisation), rôles/permissions (catalogue, assignation), audit (journalisation, jamais de hash), établissement. **Suite e2e exécutée avec `--runInBand`** (obligatoire : plusieurs fichiers de test partagent la même base dédiée, une exécution parallèle provoque des collisions de clés uniques/FK entre suites). Fixtures partagées : `prisma/seed-data.ts` (référentiel rôles/permissions/admin, réutilisé par le vrai script de seed **et** par les tests, pour ne jamais faire diverger les deux) + `test/utils/` (`test-app.ts`, `clean-database.ts`, `fixtures.ts`).
- **Seed** (`apps/api/prisma/seed.ts`, `npm run db:seed`) : idempotent, crée l'établissement (nom par défaut "Shakespeare Academy", à corriger via `PATCH /school` avec le vrai nom/adresse une fois connus), les 5 rôles, les 6 permissions Lot 1, et un compte `ADMINISTRATEUR` (`admin@shakespeareacademy.cg` / `ChangeMe123!` par défaut, **à changer immédiatement en production** — `doitChangerMotDePasse: true` dès la création, `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` pour surcharger).
- **Frontend (`apps/web`)** : scaffoldé (`create-next-app`, App Router, Tailwind) mais **aucune page métier construite** — le Lot 1 est backend uniquement, cohérent avec le déroulé équivalent sur le projet Elyon (le socle multi-tenant y avait aussi précédé toute interface). Les écrans (connexion, paramétrage établissement/années/structure, gestion utilisateurs/rôles) sont prévus mais pas commencés.
- Voir `README.md` (racine) pour les instructions d'installation/lancement/tests.
