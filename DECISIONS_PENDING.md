# Décisions métier en attente — Shakespeare Academy

Ce fichier centralise toutes les règles métier non encore validées par Shakespeare Academy. Tant qu'une ligne reste **OUVERT**, aucune donnée réelle n'est inventée dans le code : soit la fonctionnalité correspondante n'est pas construite, soit elle l'est derrière un paramètre explicite avec une valeur par défaut clairement documentée comme provisoire.

Source : `Conception_Logiciel_Shakespeare_Academy (1).docx`, §18 (« Décisions métier à obtenir »), complété par l'analyse du 16 septembre 2026 (contradictions et zones non signalées comme ouvertes par le document lui-même).

Statut possible : `OUVERT` · `TRANCHÉ` (avec date et décideur) · `PROVISOIRE` (valeur par défaut appliquée en attendant, réversible sans perte de données).

---

## 1. Données académiques

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D01 | Liste officielle complète des niveaux/classes des deux sections (le document ne confirme que Maternelle→2nde C côté francophone et Nursery→Primary côté anglophone ; collège, lycée au-delà de la 2nde C, et équivalences anglophones au-delà du primaire manquent). | Impossible de créer la structure académique réelle ; toute classe créée en attendant est une donnée de démonstration, jamais une donnée d'école. | Aucune — bloquant pour la structure académique réelle. Le Lot 1 utilisera un jeu de classes fictif clairement marqué comme tel. |
| D02 | Séries/options du lycée (au-delà de 2nde C) et éventuels sous-niveaux (ex. CE1 A / CE1 B). | Le modèle `classes` doit-il prévoir un champ "série" et un champ "groupe" dès le Lot 1, ou seulement plus tard ? | Modèle de données prévoit les deux colonnes (nullable) dès le départ — coût de conception nul, évite une migration plus tard. |
| D03 | Capacité maximale par classe : bloque-t-elle une inscription au-delà, ou n'est-ce qu'une information indicative ? | Détermine si `POST /enrollments` doit avoir un contrôle bloquant ou juste un avertissement. | Indicative uniquement (avertissement, jamais de blocage dur) tant que non tranché. |

## 2. Frais et tarification

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D04 | Montants exacts d'inscription, préinscription et écolage par cycle/niveau. | Aucun tarif réel ne peut être configuré. | Grille de démonstration fictive uniquement, jamais utilisée en production. |
| D05 | Autres frais (uniforme, transport, etc.) : lesquels existent réellement, sont-ils obligatoires ou facultatifs, à quel moment sont-ils facturés (à l'inscription ou en cours d'année) ? | Détermine si `fee_types` est fermé ou librement paramétrable par l'école, et si une facture peut être créée hors du cycle d'inscription. | `fee_types` librement paramétrable, facturable à tout moment via l'écran « Autre recette »/« Autre frais ». |
| D06 | **RG05 est auto-contradictoire tel qu'écrit** : « la somme des trois tranches doit correspondre au montant annuel, sauf si l'école choisit de ne gérer que les tranches comme référence. » Faut-il un contrôle strict (somme = montant annuel, blocage sinon) ou un mode « tranches de référence seules » où l'annuel n'est qu'indicatif ? | Change la validation du paramétrage tarifaire (bloquante ou non). | **Implémenté Lot 3 (16 septembre 2026) — contradiction évitée par construction plutôt que tranchée** : `FeeSchedule` n'a jamais de montant annuel séparé quand `FeeType.avecTranches = true` (le champ `montant` est alors interdit, pas seulement ignoré) — le total facturé est *toujours* la somme des `InstallmentSchedule`, il n'existe donc aucune valeur annuelle indépendante à laquelle comparer cette somme. Si l'école demande un jour un montant annuel affiché séparément des tranches (ex. pour vérification visuelle), ce paramètre `tranchesSommeStricte` resterait à ajouter — non fait faute de besoin exprimé. |
| D07 | Modification d'un tarif en cours d'année active (`PUT /settings/fee-schedules/{id}`) : crée-t-elle automatiquement une nouvelle version datée qui ne s'applique qu'aux inscriptions futures, ou faut-il une action explicite de type « clôturer la version courante » ? RG03 dit que les factures déjà émises ne changent jamais, mais le mécanisme de bascule n'est pas précisé. | Détermine si `fee_schedules` a une date de fin implicite (à la création d'une nouvelle version) ou explicite (action séparée). | **Partiellement implémenté Lot 3 (16 septembre 2026), reste OUVERT sur la versioning** : `PATCH /fee-schedules/:id` modifie la grille **en place** (pas de nouvelle ligne datée) — plus simple que le mécanisme de versioning proposé ci-contre, non implémenté faute de besoin confirmé. RG03 reste malgré tout respecté : `InvoiceLine.montant`/`libelle` sont un **snapshot** figé à la génération (voir `InvoicesService.generateForEnrollment`), donc une facture déjà émise ne change jamais rétroactivement même si la grille est modifiée ensuite. Ce qui manque encore : un historique consultable des anciennes valeurs d'une grille (aucun log dédié, seul `AuditLog` — FEE_SCHEDULE_UPDATE — garde une trace technique de l'ancienne/nouvelle valeur). |

## 3. Tranches d'écolage

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D08 | Montant exact et date limite de chacune des trois tranches, par cycle/niveau. | Aucune échéance réelle ne peut être générée à l'inscription. | Jeu de test fictif uniquement. |
| D09 | Délai de grâce (en jours) par tranche : uniforme pour toutes les tranches/cycles, ou paramétrable individuellement ? | Détermine la granularité du champ `delai_grace` dans `installment_schedules`. | Paramétrable par tranche (le document le suggère déjà en §7 : « Trois tranches : … et délai de grâce »). |

## 4. Paiements

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D10 | Paiement partiel autorisé — confirmé par défaut (§1.3), mais faut-il un montant minimum de paiement partiel ? | Un paiement de 100 XAF sur une tranche de 200 000 XAF doit-il être accepté ? | **Implémenté Lot 4 (17 septembre 2026)** : aucun minimum — `PaymentsService.create()` accepte tout montant entier strictement positif, plusieurs paiements successifs possibles sur la même ligne jusqu'à solde nul. |
| D11 | Compte d'avance élève : activé ou non pour le MVP ? RG08 interdit le trop-perçu « sauf activation explicite ». | Détermine si le modèle de données prévoit une table `student_credit_accounts` dès le Lot 3/4 ou seulement en post-MVP. | **Confirmé non activé au Lot 4 (17 septembre 2026)** — voir D41 : la contrainte "un paiement ne peut jamais dépasser le solde d'UNE ligne" rend le trop-perçu structurellement impossible sans compte d'avance, aucune table `student_credit_accounts` créée pour l'instant. |
| D12 | **Gap non couvert par le document, devenu sans objet (D41, 17 septembre 2026)** : si le montant reçu dépasse la somme des lignes de dette *sélectionnées* par le caissier... | Sans cette règle, RG08 (trop-perçu interdit) est contournable en ne sélectionnant que certaines lignes. | Devenu sans objet : voir D41 — un paiement ne cible jamais plusieurs lignes à la fois, il n'y a donc jamais de "sélection" à ventiler. Cette question ne redeviendrait pertinente que si un paiement multi-lignes était introduit plus tard. |
| D13 | Ordre obligatoire de règlement des dettes (les plus anciennes d'abord) : le document dit « proposer automatiquement les plus anciennes » (suggestion), mais est-ce une contrainte dure empêchant de régler une tranche récente avant une ancienne ? | Détermine si l'API valide ou seulement pré-remplit l'ordre. | **Non contraint au Lot 4** : le caissier choisit librement la ligne à régler (`invoiceLineId` explicite dans `POST /payments`), jamais forcé à respecter un ordre chronologique — cohérent avec "suggestion uniquement, jamais bloquant" ci-contre. Aucun tri "plus anciennes d'abord" n'est encore proposé visuellement côté UI (les lignes s'affichent dans l'ordre de la facture) — amélioration possible plus tard, non bloquante. |

## 5. Réinscription

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D14 | Les arriérés bloquent-ils la réinscription par défaut ? | Détermine le comportement par défaut de l'écran de réinscription. | Non bloquant par défaut (alerte affichée, pas de blocage) — le blocage est une option activable par l'école (§1.3 : « le blocage éventuel est paramétrable »). |
| D15 | Qui peut déroger à un éventuel blocage, et avec quel niveau de motif obligatoire ? | Détermine la permission requise (`ENROLLMENT_OVERRIDE_ARREARS` ?) et si un motif texte libre suffit ou s'il faut un motif codifié. | Direction uniquement, motif texte libre obligatoire, action journalisée (RG15). |

## 6. Remises et exonérations

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D16 | Types de remise (bourse, fratrie, exonération sociale, geste commercial…) et plafonds associés. | `discounts.type` reste un champ libre sans validation métier. | Liste fermée paramétrable par l'Administrateur, vide au démarrage (à remplir avec l'école). |
| D17 | Seuil au-delà duquel l'approbation Direction est obligatoire (RG06 : « au-delà d'un seuil »). | Sans seuil défini, impossible d'implémenter le contrôle. | **Implémenté Lot 3 (16 septembre 2026), toujours PROVISOIRE** : toute remise créée via `POST /discounts` part `EN_ATTENTE` (seuil = 0, aucune auto-approbation), conforme au comportement par défaut ci-contre. |
| D18 | **Granularité non précisée par le document** : une remise s'applique-t-elle à une ligne de facture précise (une rubrique) ou à la facture entière (répartie proportionnellement) ? | Change fondamentalement le modèle `discounts` (clé étrangère vers `invoice_line_id` vs `invoice_id`). | **Implémenté Lot 3 (16 septembre 2026)** : `Discount.invoiceLineId`, conforme au choix par défaut ci-contre (remise ciblée par ligne, ex. écolage seul). |
| D19 | Personnes habilitées à approuver une remise : Direction uniquement, ou aussi certains profils Administrateur ? | Détermine la permission `DISCOUNT_APPROVE`. | **Implémenté Lot 3 (16 septembre 2026)** : `DISCOUNT_APPROVE` attribuée au rôle Direction uniquement (`prisma/seed-data.ts`) — Administrateur a `FEE_MANAGE` (configure les tarifs) mais explicitement pas `DISCOUNT_APPROVE`, un appel `POST /discounts/:id/approve` par un compte Administrateur renvoie 403 (couvert par un test e2e dédié). |

## 7. Caisse

**Statut au 17 septembre 2026 : la "clôture de journée" (état des entrées/sorties/solde) est implémentée comme un simple rapport calculé (`GET /reports/cash-closing`), pas comme une vraie session de caisse avec fonds initial/ouverture/clôture formelle — D20-D23 ci-dessous restent donc entièrement OUVERTES, aucune table `cash_sessions`/`cash_registers` n'existe. Le rapport suffit à répondre au besoin exprimé ("afficher l'état des entrées, sorties et solde en caisse") sans le formalisme complet d'une session, qui reste à construire si l'école le demande explicitement.**

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D20 | Nombre de caisses réelles à l'ouverture (une seule, ou plusieurs sites/guichets ?). | Détermine le paramétrage initial de `cash_registers`. | Une seule caisse configurée au Lot 1, structure prête pour en ajouter d'autres sans migration. |
| D21 | Fonds de caisse initial : montant fixe imposé, ou libre à chaque ouverture de session ? | Détermine si `cash_sessions.fonds_initial` est un défaut par caisse modifiable, ou toujours saisi manuellement. | Saisi manuellement à chaque ouverture, avec une valeur par défaut suggérée par caisse (modifiable). |
| D22 | Règle de réouverture d'une caisse clôturée (RG12 : « autorisée et journalisée ») : qui approuve, avec quel motif, la clôture est-elle réellement rouverte ou une session correctrice est-elle créée à côté ? **Aucun écran ni endpoint n'est prévu pour ça dans le document (§8/§12) — gap identifié en dehors du §18.** | Sans cette règle, RG12 n'est pas implémentable de façon cohérente. | Direction uniquement, motif obligatoire, `POST /cash-sessions/{id}/reopen` journalisé (RG15) ; la session redevient modifiable, aucune nouvelle session n'est créée. |
| D23 | Une session de caisse est-elle strictement liée à un seul utilisateur (le caissier qui l'a ouverte), ou plusieurs caissiers peuvent-ils opérer sur la même session (relève d'équipe) ? | Détermine la contrainte d'unicité `cash_sessions × user`. | Une session = un seul caissier assigné ; une relève ferme la session en cours et en ouvre une nouvelle. |

## 8. Sorties financières (décaissements)

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D24 | Catégories de sorties réelles (fournitures, salaires, maintenance, etc.). | `expenses.categorie` reste un champ libre non validé. | **Implémenté (17 septembre 2026)** : catégories confirmées par l'école — Versement banque, Paiement salaire, Paiement facture, Achat matériel, Autre (`apps/api/src/expenses/expense-categories.ts`, `EXPENSE_CATEGORIES`). Volontairement **pas un enum Postgres** (voir `schema.prisma`) : une simple liste validée côté DTO, pour rester ajoutable sans migration si l'école en demande une nouvelle — toujours "paramétrable" en pratique, juste par une modification de code plutôt qu'un écran d'administration dédié (non construit, jugé disproportionné pour 5 valeurs fixes). |
| D25 | Seuil de double validation Direction avant décaissement. | Sans seuil, impossible d'implémenter le contrôle interne exigé en §14. | **Implémenté (17 septembre 2026), toujours PROVISOIRE (seuil = 0)** : `POST /expenses` crée toujours une sortie `EN_ATTENTE`, jamais comptée dans la clôture de journée tant qu'elle n'est pas `APPROUVEE` par la Direction (`EXPENSE_APPROVE`, même principe que `DISCOUNT_APPROVE`/`PAYMENT_CANCEL_APPROVE`). |
| D26 | Pièces justificatives obligatoires ou facultatives selon la catégorie ? | Détermine si `documents` est requis ou optionnel par sortie. | Facultatif par défaut, sauf catégories marquées "justificatif obligatoire" par l'Administrateur. **Non implémenté** : aucun upload de pièce justificative construit pour l'instant (hors périmètre de la demande initiale), `Expense` n'a pas de champ document. |

## 9. Reçus et documents

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D27 | Format papier définitif (A5, A4, 80mm thermique — un seul format ou plusieurs selon le poste de caisse ?), nombre de copies, mentions légales exactes, logo, signatures requises. | Le PDF de reçu ne peut pas être finalisé visuellement. | **Implémenté provisoirement Lot 4 (17 septembre 2026), complété le même jour** : page web imprimable (`/recus/[id]`, format carte ~420px, pensé pour un rendu A5 via l'impression navigateur — "Enregistrer en PDF" fonctionne nativement) plutôt qu'un vrai PDF généré côté serveur — aucune dépendance ajoutée (pas de Puppeteer/PDFKit), cohérent avec le principe de simplicité du projet tant que le format exact n'est pas confirmé par l'école. Contenu demandé par l'école ajouté : logo de l'établissement (`School.logoUrl`, uploadable depuis "Établissement", `POST /school/logo`), montant en toutes lettres (`lib/number-to-words-fr.ts`, ex. "quinze mille francs CFA"), emplacements "Signature du caissier" et "Cachet de la Direction" (zones vides à remplir à la main — aucune signature électronique construite). Remplaçable sans migration de données le jour où le reste de D27 (mentions légales exactes, nombre de copies, format thermique 80mm) est tranché — le rendu est un template, pas une donnée stockée. |
| D28 | Numérotation existante à reprendre (l'école a-t-elle déjà une série de reçus papier en cours qu'il faut continuer, ou repart-on de 1) ? | Détermine la valeur initiale de `number_sequences`. | **Implémenté Lot 4 (17 septembre 2026)** : `NumberSequenceService` réutilisé tel quel (`type: 'RECEIPT'`), numérotation continue par école (jamais réinitialisée par année, comme le matricule — D32), format `REC-000001`. Reprise à 1 à la mise en production, sauf indication contraire de l'école. |
| D29 | QR code de vérification du reçu (mentionné comme « éventuel » en §9.1) : construit-on une page publique de vérification (`GET /receipts/verify/{token}`), ou abandonne-t-on cette option pour le MVP ? **Aucune route correspondante n'existe en §12 — gap.** | Détermine si un module de vérification publique doit être prévu au Lot 4. | Non construit au Lot 4 (absent du §12, jamais mentionné dans les critères d'acceptation) — réévaluable en post-MVP. |
| D30 | Une réimpression (DUPLICATA) doit-elle être journalisée comme action sensible dans `audit_logs` (RG15) ? | Détermine si chaque clic « réimprimer » génère une ligne d'audit ou seulement un compteur discret sur le paiement. | **Implémenté Lot 4 (17 septembre 2026)** : `POST /payments/:id/reprint` journalise `PAYMENT_REPRINT` (RG15) avant d'afficher le reçu — distinct de `PAYMENT_CREATE` (l'émission initiale n'est jamais comptée comme une réimpression). |

## 10. Données élèves et doublons

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D31 | Champs obligatoires à la création d'un élève (au-delà de nom/prénom) et documents demandés (acte de naissance, photo, etc.). | Détermine le formulaire de création et les contraintes `NOT NULL`. | **Révisé (17 septembre 2026)** : un responsable n'est plus obligatoire à la création (`CreateStudentDto.responsable` devenu optionnel) — nécessaire pour importer des élèves déjà inscrits (fichier Excel de l'école) dont les contacts parents ne sont pas encore disponibles. Le schéma (`StudentGuardian`) l'a toujours permis ; c'était une contrainte du DTO, pas de la base. Un responsable reste ajoutable à tout moment via le bouton « Ajouter » existant sur la fiche élève. |
| D32 | Règle de matricule : format exact, génération automatique ou saisie manuelle, réutilisable après un an d'absence ou non. | Détermine `number_sequences` pour les matricules. | Génération automatique séquentielle, jamais réutilisé, format numérique simple à 6 chiffres (`000001`) — **sans l'année** : le matricule est permanent par hypothèse (§1.3), l'embarquer aurait contredit cette permanence dès qu'un élève change d'année. Modifiable sans migration si l'école fournit un format différent (le code ne dérive rien du format lui-même). |
| D33 | **Algorithme de détection de doublon non précisé** : correspondance exacte (nom + prénom + date de naissance) ou floue (tolérance orthographique) ? Qui résout un doublon détecté après coup (fusion administrée mentionnée en §19 mais jamais détaillée) ? | Détermine la logique de `GET /students/search` et l'existence ou non d'un écran de fusion. | Détection stricte (nom + prénom + date de naissance normalisés) à la création, avec alerte non bloquante si correspondance partielle. Écran de fusion différé en post-MVP tant que non tranché (les doublons resteront visibles mais non fusionnables automatiquement). |

## 11. Historique et import

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D34 | Années et soldes antérieurs à importer réellement, et qualité des fichiers sources disponibles (Excel, papier, autre logiciel ?). | Détermine l'ampleur du Lot 6 (script d'import vs saisie manuelle d'ouverture de soldes). | Aucun import automatique prévu tant que le format source n'est pas connu — solde d'ouverture saisi manuellement par élève si nécessaire. |

## 12. Infrastructure et exploitation

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D35 | Nombre d'utilisateurs simultanés attendus, qualité de connexion Internet sur site, modèles d'imprimantes réellement utilisés. | Dimensionne l'hébergement et détermine si le rendu 80mm thermique doit être testé en priorité. | À valider avant le Lot 6 (pilote), sans impact sur l'architecture du Lot 1-5. |
| D36 | Politique d'hébergement (VPS auto-géré vs solution managée) — le document laisse les deux options ouvertes. | Détermine les choix Docker Compose / CI-CD du Lot 6. | Décision différée au Lot 6, aucun couplage fort dans le code applicatif (containers portables). |
| D37 | Stockage objet des pièces jointes : MinIO auto-hébergé (dans le même Docker Compose) ou service cloud S3 externe ? | Détermine une variable de configuration, pas une réécriture de code (interface de stockage abstraite prévue dès le départ). | MinIO auto-hébergé par défaut, interchangeable via configuration (même principe qu'un adaptateur de paiement chez Elyon). |
| D38 | Politique de rétention exacte des sauvegardes (durée, nombre de copies, lieu de stockage hors site). | Détermine la configuration du script de sauvegarde du Lot 6. | Rétention 30 jours glissants par défaut, à ajuster selon la politique réelle de l'école. |

## 9. Facturation à l'inscription (soulevées en construisant le Lot 3, 16 septembre 2026)

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D39 | **Gap non couvert par le document, résolu le 17 septembre 2026** : les frais facturés à une REINSCRIPTION doivent-ils être exactement les mêmes que ceux d'une première INSCRIPTION, ou existe-t-il des frais propres à l'une ou l'autre situation (ex. « Frais d'inscription » 45 000 XAF réservé aux nouveaux élèves, « Frais de réinscription » 60 000 XAF réservé aux élèves déjà connus — cas réel confirmé par l'école) ? | Détermine si `EnrollmentsService`/`InvoicesService` doivent filtrer les `FeeSchedule` selon `EnrollmentType`. | **Implémenté (17 septembre 2026)** : `FeeType.appliesTo` (enum `TOUS`/`INSCRIPTION`/`REINSCRIPTION`, `TOUS` par défaut — ex. l'écolage, facturé quel que soit le type). `InvoicesService.generateForEnrollment()` ne retient que les `FeeSchedule` dont le `FeeType` a `appliesTo = TOUS` ou correspond exactement au type de l'inscription en cours — un frais `INSCRIPTION` n'est donc jamais facturé à une réinscription, et inversement. Testé explicitement (`fees-and-invoices.e2e-spec.ts`). |
| D40 | Seuil (en XAF) au-delà duquel un montant en retard fait basculer le statut de solvabilité (cahier §6) de `EN_RETARD` à `IMPAYE_CRITIQUE` — le document ne précise aucune valeur. | Sans seuil, le statut `IMPAYE_CRITIQUE` ne peut jamais être atteint. | `School.seuilImpayeCritiqueFcfa` (`Int?`, `null` par défaut) — tant qu'il n'est pas renseigné par l'Administrateur, `FinancialStatusService` ne renvoie jamais `IMPAYE_CRITIQUE`, seulement `EN_RETARD` (comportement le plus sûr, jamais un seuil inventé). |

## 12. Paiements et reçus (Lot 4, 17 septembre 2026)

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D41 | **Simplification délibérée non explicitement demandée par le cahier** : un paiement doit-il pouvoir être ventilé sur plusieurs lignes de facture en une seule opération (ex. régler l'inscription ET la première tranche de pension d'un coup), ou toujours cibler une seule ligne à la fois ? | Détermine la complexité du modèle `Payment` (clé étrangère simple vers `invoice_line_id` vs table de jonction `PaymentLine`) et évite ou non tout le débat D12/D13 sur la ventilation. | **Implémenté (17 septembre 2026)** : `Payment.invoiceLineId` — toujours une seule ligne par paiement, jamais réparti. Le montant est systématiquement plafonné au solde restant de CETTE ligne (`montant - remises approuvées - paiements VALIDE déjà encaissés`), ce qui rend un trop-perçu (RG08) structurellement impossible sans qu'un compte d'avance existe (D11 reste non activé) — et évite complètement le débat D12 (plus de "sélection de lignes" à valider). Un parent qui règle l'inscription ET une tranche de pension effectue simplement deux paiements distincts, chacun avec son propre reçu — cohérent avec la demande explicite de l'utilisateur ("pour chaque opération, générer un reçu"). Si l'école demande un jour un vrai paiement multi-lignes en une seule opération, ceci nécessiterait une vraie table de jonction `PaymentLine` et de trancher D12/D13. |
| D42 | Le Secrétaire-caissier qui encaisse peut-il aussi réimprimer *n'importe quel* reçu de l'école, ou seulement ceux qu'il a lui-même émis ? Le document ne le précise pas. | Détermine si `PAYMENT_CREATE` (déjà utilisée pour réimprimer) doit être scindée en une permission de lecture/réimpression séparée. | Provisoire : `PAYMENT_CREATE` couvre aussi la réimpression de **tous** les reçus de l'école, pas seulement les siens (cohérent avec "Secrétaire-caissier" étant un rôle unique dans ce MVP, cadrage §3 — pas de notion de caisse individuelle nominative pour l'instant, voir D23). |

## 14. Corrections de saisie et sorties financières (17 septembre 2026)

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D43 | **Gap non couvert par le document** : une inscription active peut-elle être déplacée vers une classe d'un **niveau différent** (pas seulement une classe-sœur du même niveau) pour corriger une erreur de saisie, sans passer par annulation + nouvelle inscription ? | Détermine si `EnrollmentsService.changeClass()` doit régénérer/recalculer les lignes de facture déjà émises lors d'un changement de niveau. | **Implémenté (17 septembre 2026)** : `PATCH /enrollments/:id/change-class` refuse explicitement (400) tout changement vers une classe d'un niveau différent — les `InvoiceLine` déjà émises sont un snapshot lié au niveau (RG03), les rendre incohérentes en changeant silencieusement de niveau serait pire que de refuser. Un vrai changement de niveau reste annulation + nouvelle inscription (regénère une facture propre au nouveau niveau). |
| D44 | La "clôture de journée" (cahier, demande explicite) doit-elle être une vraie session de caisse (ouverture avec fonds initial, clôture qui fige les montants, réouverture encadrée — D20-D23) ou un simple rapport recalculé à la demande ? | Détermine si `cash_sessions`/`cash_registers` doivent être construites maintenant. | **Implémenté comme rapport simple (17 septembre 2026)** : `GET /reports/cash-closing?date=` recalcule à chaque appel (jamais une valeur figée/stockée) les entrées (paiements `VALIDE` du jour), sorties (dépenses `APPROUVEE` du jour) et un solde cumulé (toutes entrées - toutes sorties depuis le début). Aucune notion de "clôturer" au sens strict (rien n'empêche un paiement d'être encaissé un jour donné après coup) — D20-D23 (vraie session avec fonds initial) restent une évolution possible si l'école a besoin de figer/valider une journée précise. |

## 15. Import initial des 25 élèves déjà inscrits (fichier Excel de l'école, 17 septembre 2026)

**Exécuté et vérifié en production le 17 septembre 2026** : 25 élèves importés (`SA01AM09YY` à `SA25AM09YY`, matricules conservés tels quels du fichier Excel plutôt qu'une nouvelle numérotation, cohérent avec D32 qui permet de fournir un matricule explicite), chacun avec sa vraie inscription 2026/2027, sa facture générée normalement (frais d'inscription + 3 tranches de pension), son frais d'inscription encaissé (`REC-000004` à `REC-000028`, Espèces), et une remise approuvée sur chaque tranche de pension où le montant réel du fichier différait du tarif standard (17 élèves concernés, 51 remises au total — 8 élèves déjà au tarif standard n'en ont reçu aucune). Import réalisé via un script ponctuel (non conservé dans le dépôt, propre à cette seule école) appelant uniquement la vraie API de production avec le compte Administrateur — jamais d'écriture SQL directe pour les données élève/facture/paiement, seule l'approbation des remises (D46) l'a été. Vérifié manuellement dans le navigateur sur deux cas (un avec remise : PAMBOU Brayan Curtis, CP, 100 000→90 000 par tranche ; un sans remise : BOUITY Emmanuel, Nursery 1, 110 000 conservé) — montants facturés/remises/payé/restant dû tous exacts.

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D45 | Le fichier Excel de suivi de l'école montre des montants de tranche de pension inférieurs au tarif standard unifié pour plusieurs élèves (souvent des fratries : ODZEBE, LENDO, KABA, TCHOUPA). Faut-il préserver ces montants réels ou les ignorer au profit du tarif unique ? **Tranché avec l'utilisateur.** | Détermine si l'import applique le tarif standard brut ou une remise corrective par élève. | **Tranché (17 septembre 2026)** : chaque élève est inscrit au tarif standard (facture générée normalement par `InvoicesService`), puis une remise `MONTANT_FIXE` est créée sur chaque ligne de pension où le montant réel du fichier diffère du tarif standard, motif « Tarif historique / fratrie (import initial) ». Reproductible plus tard via le workflow normal (`POST /discounts`) si l'école signale un nouveau cas. |
| D46 | Aucune des 25 remises d'import ne peut être approuvée par un compte Direction (aucun n'existe en production à cette date) — l'utilisateur a demandé d'utiliser le compte Administrateur existant. | Le contrôle de séparation des tâches (Direction approuve, jamais l'auteur de la demande) serait contourné si on l'assouplissait dans le code. | **Tranché (17 septembre 2026), portée limitée à cet import** : les 25 remises ont été approuvées directement en base (mêmes champs que `DiscountsService.approve()` : `statut=APPROUVEE`, `approbateurId`, `dateDecision`, plus une ligne d'audit `DISCOUNT_APPROVE` équivalente), sans toucher au système de permissions. `DISCOUNT_APPROVE` reste strictement réservée au rôle Direction pour toute remise future créée depuis l'application — aucun compte Administrateur n'a reçu ce droit. |
| D47 | Le fichier Excel ne contient aucun nom ni téléphone de responsable pour les 25 élèves. | `CreateStudentDto.responsable` était obligatoire (D31), ce qui aurait bloqué l'import. | **Tranché (17 septembre 2026)** : import sans responsable (voir révision de D31 ci-dessus) — à ajouter par l'école au cas par cas via le bouton « Ajouter » de la fiche élève, dès que les contacts seront disponibles. |
| D48 | Mode de paiement à enregistrer pour les frais d'inscription des 25 élèves (le fichier ne précise pas Espèces vs Mobile Money) ; l'utilisateur a confirmé que seuls ces frais d'inscription ont déjà été réellement payés, pas les tranches de pension. | Un mode de paiement doit être choisi pour créer un `Payment` valide. | **Provisoire** : `ESPECES` retenu par défaut (mode le plus probable dans le contexte de l'école, aucune référence externe n'étant disponible dans le fichier) — à corriger élève par élève si un paiement s'avère avoir été fait en Mobile Money (annulation + nouveau paiement, RG09). |

## 16. Application installable et mode hors ligne (21 septembre 2026)

| # | Question | Impact | Décision |
|---|---|---|---|
| D49 | L'utilisateur a demandé une application installable (PWA) utilisable sans Internet, avec synchronisation au retour du réseau, **paiements compris**. Cela assouplit RG10 (numéro de reçu unique, séquentiel, généré par le serveur) et rend RG08 (pas de trop-perçu) vérifiable seulement à l'envoi. | Un encaissement saisi hors ligne ne peut pas recevoir de numéro REC-xxxxxx : seul le serveur le fabrique. | **Tranché avec l'utilisateur (« Tout, y compris les paiements »).** (1) **Reçu provisoire** `PROV-{appareil}-{jjmmaa}-{n}` remis au parent, portant la mention « Ne remplace pas le reçu officiel » et sans code de vérification ; le **numéro officiel REC-xxxxxx n'est attribué qu'à la synchronisation** (RG10 inchangée côté serveur : aucun numéro n'est consommé pour un encaissement refusé ou rejoué). (2) **Le serveur revérifie tout à l'envoi** : un montant qui dépasse le solde (RG08), un doublon d'élève ou une ligne inconnue est refusé et signalé dans « Synchronisation » ; le parent a alors déjà un reçu provisoire, risque accepté par l'utilisateur. (3) **Idempotence** : chaque saisie envoyée porte une clé `Idempotency-Key` ; un renvoi (réponse perdue) ne crée jamais de doublon. Un numéro provisoire est unique par école. (4) **Date de saisie** transmise avec le paiement (`dateSaisie`), acceptée seulement avec un numéro provisoire, jamais dans le futur (tolérance 10 min) ni au-delà de 45 jours ; elle devient `datePaiement`. (5) **Ce qui reste exclusivement en ligne** : approbation ou rejet (remises, sorties), annulation d'un paiement, réimpression auditée, ajout d'un autre frais, changement de classe, annulation d'inscription, clôture de journée : la séparation des tâches et la traçabilité ne se délèguent pas à un appareil déconnecté. (6) **Saisies possibles hors ligne** : encaissement, demande de remise, sortie financière, nouvel élève, inscription (chaînée à l'élève créé hors ligne), correction d'un élève, ajout d'un responsable. (7) **Sécurité de l'appareil** : les données consultées sont copiées sur l'appareil (IndexedDB), effacées à la déconnexion ; une saisie non envoyée survit à la déconnexion et n'est envoyée que par le compte qui l'a faite (le reçu et l'audit doivent nommer la bonne personne). La reprise de session hors ligne ne redemande pas le mot de passe : à réserver à des appareils verrouillés. |

**Limites connues, à communiquer** : les pages dynamiques (`/eleves/<id>`, `/recus/<id>`) ne sont disponibles hors ligne que si elles ont été copiées (bouton « Préparer le mode hors ligne » avec Internet, refait toutes les 6 h) ; icône de l'application générique (« S », le vrai logo n'étant pas disponible en fichier) ; le service worker n'est actif qu'en production.

## 17. Vie scolaire 360° : emploi du temps, assiduité, pointage, portail parent, communication (proposition du 21 septembre 2026)

Source : `docs/Addendum_Cadrage_v1.1_Vie_Scolaire_360.md`. Ces décisions préparent les Lots 7 à 14.

**Statut au 21 septembre 2026 : D50 à D78 TRANCHÉES.** La Direction de Shakespeare Academy a validé, sur le document de validation qui lui a été remis, **toutes les valeurs proposées ci-dessous, telles quelles** (aucune réponse différente). Elles restent néanmoins des **paramètres modifiables**, jamais des constantes codées en dur (la Direction peut les changer plus tard sans intervention technique), et aucune donnée réelle (horaires, matières, seuils) n'est préchargée : la Direction la saisit elle-même dans l'application (espace « Vie scolaire », Lot 7).

Restent à fournir par la Direction, par saisie dans l'application : emploi du temps actuel, liste des enseignants et des matières, jours et horaires, calendrier scolaire, classe pilote et enseignant volontaire. Le règlement intérieur et le modèle de justificatif d'absence sont à transmettre en document.

### 17.1 Périmètre

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D50 | Élargir l'application à une vision 360° (le cahier v1.0 §1.2 classe emploi du temps et portail parent hors périmètre) et dans quel ordre. | Sans décision explicite, ces fonctionnalités contredisent le cadrage. | **TRANCHÉ (21 septembre 2026, propriétaire du projet)** : périmètre élargi et ordre des Lots 7 à 14 validés tel que proposé (référentiel, emploi du temps, assiduité, pointage, portail parent, notifications, messagerie, pilotage). Variante non retenue à ce stade : un portail parent minimal avant le Lot 8, pour tester l'adoption du canal. |
| D51 | Notes, bulletins, cahier de textes, discipline, santé, cantine, transport, paie, paiement Mobile Money parent, portail élève : dans la vague 1 ? | Détermine l'ampleur du projet et les dates. | Hors vague 1, à cadrer séparément. Chaque ajout passe par une décision explicite. |

### 17.2 Référentiel et emploi du temps

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D52 | Jours de classe et horaires réels (samedi travaillé ? durée des cours ? récréations ?). | Détermine la grille des créneaux. | Lundi à vendredi ; samedi activable par paramètre ; **aucun créneau préchargé** : la Direction définit la grille dans l'écran. Fournir un emploi du temps réel actuel. |
| D53 | Une grille horaire commune ou une grille par section (anglophone, francophone) ? | Le modèle de créneau dépend ou non de la section. | Une grille par section possible, commune par défaut. |
| D54 | Source de la liste des matières par niveau et section. | Impossible de créer des affectations réalistes. | Aucune matière préchargée ; saisie ou import Excel fourni par l'école (même approche que D01). |
| D55 | Trimestres et calendrier scolaire (dates, vacances, jours fériés). | Détermine les périodes de statistiques et les jours sans classe. | Trois trimestres par année scolaire ; dates saisies par la Direction, jamais codées ; jours fériés saisis à la main, sans calendrier national préchargé. |
| D56 | Profil enseignant : compte utilisateur avec rôle ENSEIGNANT et fiche complémentaire (spécialités, quotité) ? Un enseignant peut-il intervenir dans plusieurs sections ? La paie est-elle gérée ? | Détermine le modèle `Teacher` et les permissions. | Compte utilisateur plus fiche ; plusieurs classes et sections possibles ; **aucune donnée de paie ni de contrat** (export d'heures uniquement). |

### 17.3 Assiduité des élèves

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D57 | À partir de quand un élève en retard devient-il absent de la séance ? | Détermine le calcul des statuts. | Retard jusqu'à 15 minutes après le début de la séance, absent au-delà. **Paramètre modifiable, valeur provisoire.** |
| D58 | Motifs d'absence, justificatifs, qui valide et sous quel délai. | Détermine le circuit de justification. | Liste de motifs paramétrable ; le parent déclare via le portail, la vie scolaire valide ; délai de 3 jours ouvrés. **Valeurs provisoires paramétrables.** |
| D59 | Jusqu'à quand l'auteur peut-il corriger un appel ? | Détermine le verrouillage (RV04). | Modifiable par son auteur jusqu'à la fin de la journée ; ensuite correction par la vie scolaire ou la Direction, avec motif et audit. |
| D60 | Qui fait l'appel et à quelle granularité (par séance ou par demi-journée) ? | Détermine l'écran d'appel et le volume de données. | L'enseignant de la séance, en classe ; le surveillant peut saisir et corriger ; par séance, avec option par demi-journée. Tous présents par défaut pour limiter le nombre de gestes. |
| D61 | Seuils d'alerte d'assiduité (nombre d'absences non justifiées avant alerte). | Détermine les alertes à la Direction et aux parents. | **Aucun seuil inventé : alertes désactivées** tant que la Direction n'en fixe pas. |

### 17.4 Pointage des enseignants

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D62 | Comment pointe-t-on un enseignant et qui valide ? | Détermine l'écran, l'anti-fraude et la confiance dans les heures. | Le surveillant pointe la présence sur la liste des séances du jour ; l'enseignant peut confirmer ; un enseignant ne valide jamais son propre pointage (RV06). Pas de géolocalisation ni de QR dans la vague 1. **MODIFIÉE à la demande de la Direction (21 septembre 2026, Lot 10) : pointage par QR code scanné par l'enseignant lui-même** (QR de la salle au début et à la fin de chaque cours pour le collège et le lycée ; QR de l'entrée de l'école à l'arrivée et au départ pour la maternelle et le primaire), validé ensuite par un tiers (RV06 inchangée) ; la saisie par le surveillant reste le recours en cas d'oubli ou de téléphone en panne. Toujours pas de géolocalisation. Trois paramètres provisoires modifiables : fenêtre d'ouverture du pointage (15 minutes avant l'heure), tolérance de retard (10 minutes, D63), délai minimal entre deux scans (5 minutes). |
| D63 | Tolérance de retard d'un enseignant et règle de comptage des heures. | Détermine les heures effectuées et les retards signalés. | Tolérance de 10 minutes, **paramètre provisoire** ; heures effectuées = durée des séances tenues, calculées (RV07). |
| D64 | Remplacements : qui saisit, qui est crédité des heures ? | Détermine le récapitulatif mensuel. | La vie scolaire saisit le remplacement ; le remplaçant est crédité, l'absent est marqué absent. |

### 17.5 Portail parent

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D65 | Canal d'alerte vers les parents : notification push (gratuite, demande l'installation de l'application, limitée sur iPhone), SMS ou WhatsApp (payants, dépendance à un fournisseur) ? | Détermine le coût récurrent et la portée réelle. | Notification push et message dans l'application ; **SMS et WhatsApp non activés** avant enquête sur l'équipement réel des parents (D78) et chiffrage. |
| D66 | Comment un parent obtient-il son compte ? | Un compte créé librement permet l'usurpation d'identité. | Activation par un code remis par le secrétariat, lié au responsable enregistré (`Guardian`), puis mot de passe choisi ; pas de création libre. **Réalisé au Lot 11** : l'identifiant du parent est le numéro de téléphone enregistré sur la fiche du responsable (le secrétariat doit donc le tenir à jour), le code (8 caractères, à usage unique, valable 7 jours par défaut, brûlé après 5 essais faux) se remet en main propre ; un nouveau code sert aussi de réinitialisation du mot de passe. Il n'y a pas de récupération par SMS ou e-mail. |
| D67 | Tous les responsables d'un élève ont-ils accès ? Cas d'un responsable à qui l'accès doit être refusé (décision de justice, par exemple). | Détermine les droits par lien élève-responsable. | Tous les responsables rattachés ont accès ; la Direction peut retirer l'accès d'un responsable, avec audit. |
| D68 | Langues du portail. | Détermine la traduction des écrans et des alertes. | Français en vague 1, structure prête pour l'anglais (section anglophone) ; à confirmer. |

### 17.6 Notifications

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D69 | Contenu d'une alerte sur un canal externe. | Un SMS ou une notification peut être lu par un tiers (RV10). | Alerte générique avec le prénom de l'enfant et un lien vers l'application ; **jamais** de motif d'absence, de note ni de montant. |
| D70 | Notifications financières (échéance, impayé) via le canal parent. | Sensibilité et risque de contentieux. | Désactivées en vague 1 ; consultation de la situation financière dans le portail uniquement, sauf décision de la Direction. |
| D71 | Quels événements notifier et à quel rythme. | Détermine le volume et l'agacement des parents. | Immédiat pour absence, retard et enseignant absent ; regroupé pour les annonces et changements d'emploi du temps ; préférences par parent. |

### 17.7 Messagerie et annonces

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D72 | Qui peut écrire à qui. | Détermine le périmètre de risque (RV09). | Enseignants affectés à la classe de l'enfant ↔ responsables de cet enfant ; Direction et vie scolaire ↔ tous ; jamais de parent à parent ; aucun numéro personnel affiché. |
| D73 | La Direction peut-elle consulter les échanges ? | Détermine la supervision et la transparence. | Oui, avec journalisation de chaque consultation, et information des utilisateurs dans les conditions d'usage. |
| D74 | Délais et plages horaires de réponse. | Attentes des parents et pression sur les enseignants. | Aucune restriction technique en vague 1 ; délai de réponse indicatif de 2 jours ouvrés affiché. **Provisoire.** |
| D75 | Pièces jointes et modération. | Risque de contenus inappropriés et de fuite de données. | Texte seul en vague 1 ; possibilité de signaler un message à la Direction ; pas de suppression, retrait modéré avec trace. |

### 17.8 Données personnelles et exploitation

| # | Question | Impact si non tranchée | Valeur par défaut proposée |
|---|---|---|---|
| D76 | Consentement et cadre légal pour les données de mineurs et les communications. | Risque juridique et de réputation. | Consentement du responsable enregistré à l'activation du compte, politique de confidentialité affichée, minimisation des données ; **conformité légale locale à faire valider par l'école ou un conseil juridique**. **Lot 11 : le texte de la politique affichée aux parents (`/parents/confidentialite`, version `2026-09-v1`) est un PROJET rédigé d'après ce que l'application fait réellement ; il doit être relu et validé par l'école avant l'ouverture aux parents.** |
| D77 | Durée de conservation des présences, messages et notifications. | Volume de données et obligations légales. | Année scolaire en cours plus une année, puis archivage ; **provisoire, à valider avec D76**. |
| D78 | Volumétrie et équipement réels : nombre d'enseignants, de classes, de parents ; type de téléphone, usage de WhatsApp, forfaits de données. | Dimensionnement et choix du canal (D65). Complète D35. | Enquête auprès d'une classe pilote avant le Lot 12 ; aucun choix de canal payant avant ses résultats. |

---

## Décisions déjà tranchées par le document lui-même (rappel, non ouvertes)

Ces points ne sont **pas** dans ce fichier car le cahier de cadrage les fixe explicitement — ils sont listés ici uniquement pour éviter qu'une future relecture les remette en question par erreur :

- Montants XAF entiers, sans décimales, aucun calcul financier en flottant (RG16).
- Immutabilité des écritures financières validées ; toute correction = annulation + écriture inverse liée (RG09, RG18).
- Numéros de reçu uniques, séquentiels, générés côté serveur (RG10).
- Le Secrétaire-caissier ne valide jamais ses propres annulations, remises exceptionnelles ou écarts de caisse — la Direction seule approuve.
- Une seule année scolaire active pour les opérations courantes ; les années antérieures restent consultables, jamais modifiables.
- Mode hors ligne explicitement exclu du MVP (**levé le 21 septembre 2026, voir D49**).
- « Mobile money » comme mode de paiement = enregistrement manuel d'un encaissement avec référence externe, **pas** une intégration API de paiement automatisé (hors périmètre initial, §1.2).

---

*Dernière mise à jour : 21 septembre 2026 : D49 (mode hors ligne) ; D50 à D78 (vie scolaire 360°) validées par la Direction. Création initiale le 16 septembre 2026.*
