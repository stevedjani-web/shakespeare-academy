// Contrôle de lib/family-collection.ts : node scripts/check-family-collection.mjs
import assert from "node:assert/strict";
import {
  EMPTY_PARENT,
  activatedMessage,
  buildSubmission,
  childMissing,
  collectMessage,
  collectUrl,
  hasConflict,
  parentLoginUrl,
  parentMissing,
  passwordIssue,
  phoneIsPlausible,
} from "../lib/family-collection.ts";

const today = "2026-10-09";

// Téléphone : huit chiffres au moins, quelle que soit la présentation.
assert.equal(phoneIsPlausible("+242 06 123 45 67"), true);
assert.equal(phoneIsPlausible("061234567"), true);
assert.equal(phoneIsPlausible("12345"), false);
assert.equal(phoneIsPlausible("abc"), false);

// Parent : nom, prénom, téléphone et lien obligatoires ; l'e-mail est facultatif mais doit être valide.
assert.deepEqual(parentMissing(EMPTY_PARENT), ["nom", "prenom", "telephone", "lien"]);
const parent = { ...EMPTY_PARENT, nom: "Moukala", prenom: "Josiane", telephone: "061234567", lien: "Mère" };
assert.deepEqual(parentMissing(parent), []);
assert.deepEqual(parentMissing({ ...parent, email: "pas-un-email" }), ["email"]);
assert.deepEqual(parentMissing({ ...parent, email: " josiane@example.com " }), []);

// Enfant : nom, prénom et date de naissance plausible (ni future, ni avant 1990).
const child = { key: "a", nom: "Moukala", prenom: "Alice", dateNaissance: "2015-04-12", lieuNaissance: "", classId: "" };
assert.deepEqual(childMissing(child, today), []);
assert.deepEqual(childMissing({ ...child, dateNaissance: "" }, today), ["dateNaissance"]);
assert.deepEqual(childMissing({ ...child, dateNaissance: "2026-10-10" }, today), ["dateNaissance"]);
assert.deepEqual(childMissing({ ...child, dateNaissance: "1980-01-01" }, today), ["dateNaissance"]);
assert.deepEqual(childMissing({ ...child, nom: " ", prenom: "" }, today), ["nom", "prenom"]);

// Mot de passe : huit caractères au moins, confirmation identique.
assert.equal(passwordIssue("court", "court"), "short");
assert.equal(passwordIssue("MotDePasse123", "Autre"), "mismatch");
assert.equal(passwordIssue("MotDePasse123", "MotDePasse123"), null);

// Corps envoyé : une valeur facultative vide est omise, la classe du lien aussi (le serveur la prend par défaut).
const body = buildSubmission(
  { ...parent, email: "", profession: " ", adresse: "Poto-Poto" },
  [child, { ...child, key: "b", prenom: "Brice", classId: "autre", lieuNaissance: "Pointe-Noire" }, { ...child, key: "c", prenom: "Chloé", classId: "lien" }],
  "lien",
  "MotDePasse123",
  "2026-09-v8",
);
assert.equal(body.responsable.email, undefined);
assert.equal(body.responsable.profession, undefined);
assert.equal(body.responsable.adresse, "Poto-Poto");
assert.equal(body.responsable.lien, "Mère");
assert.equal(body.consentement, true);
assert.equal(body.versionPolitique, "2026-09-v8");
assert.equal(body.enfants[0].classId, undefined);
assert.equal(body.enfants[0].lieuNaissance, undefined);
assert.equal(body.enfants[1].classId, "autre");
assert.equal(body.enfants[1].lieuNaissance, "Pointe-Noire");
assert.equal(body.enfants[2].classId, undefined, "la classe du lien n'est pas renvoyée");

// Adresses et messages du groupe : bilingues, avec l'adresse deux fois.
assert.equal(collectUrl("https://ecole.test", "abc"), "https://ecole.test/famille/abc");
assert.equal(parentLoginUrl("https://ecole.test"), "https://ecole.test/parents/connexion");
const m = collectMessage({ ecole: "Shakespeare Academy", classe: "CM2 A", url: "https://x/famille/abc" });
assert.match(m, /Chers parents de CM2 A/);
assert.match(m, /Dear parents of CM2 A/);
assert.equal(m.split("https://x/famille/abc").length - 1, 2);
const a = activatedMessage({ ecole: "Shakespeare Academy", classe: "CM2 A", url: "https://x/parents/connexion" });
assert.match(a, /ont été validés/);
assert.match(a, /have been approved/);

// Conflit : seule une alerte de gravité « conflit » le compte.
assert.equal(hasConflict(null), false);
assert.equal(hasConflict({ alertes: [{ code: "NUMERO_DEJA_UTILISE", severite: "info" }] }), false);
assert.equal(hasConflict({ alertes: [{ code: "DATE_DIFFERENTE", severite: "conflit" }] }), true);

console.log("collecte des familles : tous les contrôles passent");
