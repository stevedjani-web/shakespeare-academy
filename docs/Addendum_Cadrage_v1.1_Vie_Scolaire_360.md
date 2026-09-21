# Addendum au cahier de cadrage v1.0 : vie scolaire 360°

**Statut : VALIDÉ par la Direction le 21 septembre 2026 (décisions D50 à D78 acceptées telles que proposées).**
Les décisions D51 à D78 de `DECISIONS_PENDING.md` (§17) sont validées : ce document complète le cahier de cadrage v1.0. En cas de divergence, le cahier v1.0 continue de faire foi pour les Lots 1 à 6.

## 1. Objet

Le cahier v1.0 (§1.2) classe explicitement comme *hors périmètre initial* : notes, emplois du temps, cantine, transport, paie, portail parent, mobile money, application mobile. Le propriétaire du projet a décidé d'élargir l'application à une vision « 360° » où tous les acteurs de l'école sont concernés : emploi du temps, pointage des enseignants, retards et absences des élèves, notifications aux parents, communication sécurisée entre enseignants et parents.

Cet addendum définit ce périmètre, les règles de gestion nouvelles, l'ordre de développement et les critères d'acceptation. Il ne modifie ni la doctrine financière (RG08, RG09, RG10, RG16, RG18) ni le socle existant.

## 2. Ce qui existe déjà et sera réutilisé

- Utilisateurs, rôles et permissions fines (`@RequirePermission`), audit append-only (RG15).
- Années scolaires, sections, cycles, niveaux, classes, inscriptions, responsables (`Guardian`, avec téléphone).
- Mode hors ligne : PWA, file d'attente des saisies, idempotence côté serveur (D49). Indispensable pour l'appel en classe et le pointage.
- Interface : composants, exports PDF et Excel, boutons +/− pour développer.

Ce qui manque et sera créé : enseignant, matière, période (trimestre), salle, créneau horaire, emploi du temps, séance, présence, compte parent, notification, message.

## 3. Périmètre

### Vague 1 (Lots 7 à 14)

| Domaine | Fonctionnalités |
|---|---|
| Personnel et référentiel | Fiche enseignant, matières par niveau et section, affectations enseignant × matière × classe, trimestres, calendrier scolaire, salles, créneaux |
| Emploi du temps | Séances, détection de conflits, publication versionnée, vues par classe, enseignant et salle, export PDF, annulations et remplacements ponctuels |
| Assiduité des élèves | Appel par séance (présent, absent, retard avec minutes, excusé), justificatifs, historique, alertes de seuil, saisie hors ligne |
| Pointage des enseignants | Présence, retard et absence par séance, remplacements, heures prévues et effectuées, récapitulatif mensuel exportable, validation par un tiers |
| Portail parent | Comptes parents sécurisés, consultation de l'emploi du temps, des absences et retards, de la situation financière et des reçus de leurs enfants |
| Notifications | Événements (absence, retard, enseignant absent, changement d'emploi du temps, annonce), préférences par parent, canaux à décider (D65) |
| Communication | Messagerie enseignants ↔ parents et annonces par classe, dans l'application, supervisée |
| Pilotage | Tableau de bord Direction : assiduité, ponctualité des enseignants, alertes de décrochage |

### Vague 2 (à cadrer séparément, non engagée)

Notes, évaluations et bulletins ; cahier de textes ; discipline ; santé et infirmerie ; cantine ; transport ; export de paie ; paiement Mobile Money par les parents ; portail élève.

### Hors périmètre

Gestion de la paie elle-même, comptabilité générale, application mobile native.

## 4. Acteurs, rôles et permissions (codes provisoires)

| Rôle | Périmètre |
|---|---|
| Direction | Tout, dont validation des pointages, supervision des messages, pilotage |
| Secrétariat / caisse | Inchangé (inscriptions, encaissements) ; création des comptes parents |
| Enseignant (`ENSEIGNANT`) | Son emploi du temps, l'appel de ses séances, la messagerie avec les parents de ses classes |
| Surveillant / vie scolaire (`SURVEILLANT`) | Saisie et correction des présences, validation des pointages, justificatifs |
| Parent (`PARENT`) | Uniquement les données de ses enfants |

Permissions envisagées (à confirmer au Lot 7) : `TIMETABLE_MANAGE`, `TIMETABLE_READ`, `ATTENDANCE_TAKE`, `ATTENDANCE_CORRECT`, `TEACHER_CHECKIN_VALIDATE`, `MESSAGE_SUPERVISE`, `ANNOUNCEMENT_PUBLISH`, `PARENT_ACCOUNT_MANAGE`. Chaque action reste gardée côté serveur, jamais seulement masquée dans l'interface.

## 5. Règles de gestion nouvelles (RV)

Préfixe RV pour ne pas entrer en collision avec les RG du cahier v1.0.

- **RV01** : une séance a exactement une classe, une matière, un enseignant et une salle. Pas de co-enseignement ni de groupes de niveau dans la vague 1.
- **RV02** : un enseignant, une salle ou une classe ne peut pas être sur deux séances simultanées. Le conflit bloque la publication.
- **RV03** : un emploi du temps publié est versionné avec une date d'effet. Modifier crée une nouvelle version ; l'historique et les présences déjà saisies ne changent jamais (même esprit que RG03).
- **RV04** : une présence porte un seul statut par élève et par séance. Modifiable par son auteur jusqu'au verrouillage (D59) ; ensuite corrigée par la vie scolaire ou la Direction, avec motif et audit.
- **RV05** : le statut retard, absent ou excusé suit les seuils paramétrés (D57, D58), jamais des valeurs codées.
- **RV06** : un enseignant ne valide jamais son propre pointage (séparation des tâches, comme pour les annulations de paiement).
- **RV07** : les heures effectuées sont calculées à partir des séances tenues, jamais saisies (même principe que RG13).
- **RV08** : un parent n'accède qu'aux élèves dont il est responsable. Isolation stricte, testée comme l'isolation entre établissements l'a été ailleurs.
- **RV09** : un message ne peut relier qu'un enseignant affecté à la classe de l'enfant et un responsable de cet enfant, ou la Direction et la vie scolaire. Aucun numéro personnel n'est échangé ni affiché.
- **RV10** : un canal externe (push, SMS, WhatsApp) ne transporte jamais de contenu sensible : ni motif d'absence, ni note, ni montant. Le détail reste dans l'application authentifiée.
- **RV11** : toute action sensible est journalisée (RG15 étendue) : correction de présence, validation de pointage, publication d'emploi du temps, lecture supervisée d'un message.
- **RV12** : les données de mineurs sont minimisées et conservées selon la politique de rétention décidée (D77).

## 6. Lots de développement

Dépendances : 7 → 8 → 9 et 10 ; 9 et 10 → 12 ; 11 → 12 → 13 ; tous → 14. Taille relative : S petit, M moyen, L grand.

| Lot | Contenu | Taille | Critères d'acceptation vérifiables |
|---|---|---|---|
| 0 | Validation de cet addendum et des décisions D51 à D78 | S | Décisions passées en TRANCHÉ ou PROVISOIRE par la Direction |
| 7 | Référentiel pédagogique et personnel | M | Un enseignant, des matières, trimestres, salles et créneaux créés et affectés à une classe ; permissions testées ; audit présent |
| 8 | Emploi du temps | L | Conflit d'enseignant, de salle et de classe refusé ; publication versionnée ; vues classe, enseignant, salle ; export PDF ; un changement ponctuel ne modifie pas l'historique |
| 9 | Assiduité des élèves | L | Appel complet d'une classe hors ligne puis synchronisé sans doublon ; correction après verrouillage tracée ; justificatif ; historique par élève |
| 10 | Pointage des enseignants | M | Pointage validé par un tiers ; auto-validation refusée côté serveur ; heures effectuées calculées ; récapitulatif mensuel exportable |
| 11 | Comptes parents et portail en lecture | M | Activation par code ; un parent voit ses enfants et jamais un autre élève (test d'isolation) ; consentement enregistré |
| 12 | Notifications | M | Absence saisie, alerte reçue sans contenu sensible ; préférences respectées ; envoi en échec sans bloquer la saisie |
| 13 | Messagerie sécurisée et annonces | L | Message refusé hors couple enseignant/responsable autorisé ; supervision Direction journalisée ; aucun numéro exposé |
| 14 | Pilotage 360° | M | Indicateurs recalculés depuis les données sources, jamais saisis ; exports |

**Variante possible :** avancer une version minimale du Lot 11 (finance et reçus uniquement, qui existent déjà) avant le Lot 8, pour tester l'adoption du canal avec de vrais parents tôt. À décider (D50).

Chaque lot est livré comme les précédents : tests automatisés, vérification manuelle dans le navigateur, déploiement, entrée datée dans `CLAUDE.md`.

## 7. Exigences transverses

- **Hors ligne d'abord** pour l'appel et le pointage : file d'attente, idempotence, aucun blocage en cas de coupure.
- **Sécurité** : authentification forte des parents (activation par code remis par l'école, pas de création libre), journalisation, isolation par élève, contenus sensibles jamais hors application.
- **Performance** : l'appel d'une classe doit rester utilisable sur téléphone à faible connexion.
- **Données de mineurs** : minimisation, consentement des responsables enregistré, rétention définie, droit d'accès et de suppression. La conformité légale locale est à faire valider par l'école ou un conseil juridique ; ce document ne la garantit pas.
- **Rien d'inventé** : tout point non validé est noté dans `DECISIONS_PENDING.md` avec une valeur provisoire paramétrable, jamais codée en dur.

## 8. Risques

| Risque | Effet | Parade |
|---|---|---|
| Adoption du canal par les parents inconnue | Notifications et messagerie inutilisées | Enquête d'équipement avant le Lot 12 ; pilote sur une classe |
| Emploi du temps réel plus complexe que le modèle (groupes, demi-classes, alternance) | Refonte du Lot 8 | Recueillir un vrai emploi du temps de l'école avant le Lot 8 |
| Saisie de l'appel jugée trop lourde par les enseignants | Données incomplètes | Appel en un geste (tous présents par défaut), essai sur une classe |
| Messagerie mal encadrée | Conflits, contentieux, atteinte à des mineurs | Supervision, journalisation, périmètre restreint (RV09), lot livré en dernier |
| Coût des SMS ou de WhatsApp | Budget récurrent imprévu | Push gratuit par défaut ; chiffrage avant tout canal payant |
| Élargissement continu du périmètre | Retards sur la vague 1 | Vague 2 séparée, décision explicite pour chaque ajout |

## 9. Validation demandée à la Direction

1. Le périmètre de la vague 1 et l'ordre des Lots 7 à 14 (D50).
2. Les décisions D51 à D78 : pour chacune, valider la valeur provisoire ou en donner une autre.
3. La fourniture de : un emploi du temps réel actuel, la liste des enseignants et matières, les horaires, le nombre de classes par section.
4. Le choix d'une classe pilote pour les Lots 9 et 10.
