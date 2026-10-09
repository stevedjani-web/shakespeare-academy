// Contrôle de lib/family-collection.ts : node scripts/check-family-collection.mjs
import assert from "node:assert/strict";

// --- Formulaire public des familles : cadrage de la photo, date de naissance, mot de passe, brouillon, envoi multipart.
import {
  MAX_ZOOM,
  PHOTO_FRAME_RATIO,
  birthYears,
  clampCrop,
  coverScale,
  cropRect,
  daysInMonth,
  draftKey,
  isoFromParts,
  looksLikeImage,
  parseDraft,
  partsFromIso,
  passwordStrength,
  serializeDraft,
} from "../lib/family-form.ts";
import { buildFormData } from "../lib/family-collection.ts";
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
  "2026-09-v9",
);
assert.equal(body.responsable.email, undefined);
assert.equal(body.responsable.profession, undefined);
assert.equal(body.responsable.adresse, "Poto-Poto");
assert.equal(body.responsable.lien, "Mère");
assert.equal(body.consentement, true);
assert.equal(body.versionPolitique, "2026-09-v9");
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


// Cadrage : une photo paysage 4000x3000 dans un cadre 300x400 (3:4).
const base = { width: 4000, height: 3000, frameWidth: 300, frameHeight: 400, zoom: 1, x: 0, y: 0 };
assert.equal(PHOTO_FRAME_RATIO, 0.75);
// À zoom 1 l'image couvre juste la hauteur : la zone montrée fait 2250 de large sur 3000 de haut, centrée.
assert.equal(coverScale(base), 400 / 3000);
{
  const r = cropRect(base);
  assert.ok(Math.abs(r.sw - 2250) < 1e-6 && Math.abs(r.sh - 3000) < 1e-6, "zone montrée à zoom 1");
  assert.ok(Math.abs(r.sx - 875) < 1e-6 && Math.abs(r.sy) < 1e-6, "zone centrée");
  assert.ok(Math.abs(r.sw / r.sh - PHOTO_FRAME_RATIO) < 1e-9, "toujours en portrait 3:4");
}
// Zoom 2 : la zone montrée est deux fois plus petite, toujours 3:4.
{
  const r = cropRect({ ...base, zoom: 2 });
  assert.ok(Math.abs(r.sw - 1125) < 1e-6 && Math.abs(r.sh - 1500) < 1e-6);
  assert.ok(Math.abs(r.sx - 1437.5) < 1e-6 && Math.abs(r.sy - 750) < 1e-6);
}
// Déplacer l'image vers la droite montre une zone plus à gauche ; le décalage est borné pour ne jamais montrer de vide.
{
  const moved = cropRect({ ...base, zoom: 2, x: 50 });
  assert.ok(moved.sx < cropRect({ ...base, zoom: 2 }).sx);
  const huge = clampCrop({ ...base, zoom: 2, x: 99999, y: -99999 });
  const scale = coverScale(base) * 2;
  assert.ok(Math.abs(huge.x - (4000 * scale - 300) / 2) < 1e-6, "borne horizontale");
  assert.ok(Math.abs(huge.y + (3000 * scale - 400) / 2) < 1e-6, "borne verticale");
  const edge = cropRect({ ...base, zoom: 2, x: 99999, y: 0 });
  assert.ok(edge.sx >= -1e-6 && edge.sx + edge.sw <= 4000 + 1e-6, "la zone reste dans l'image");
  // À zoom 1, aucun décalage horizontal n'est possible dans l'axe qui coïncide avec le cadre.
  assert.equal(clampCrop({ ...base, y: 500 }).y, 0);
}
// Le zoom reste dans les bornes.
assert.equal(clampCrop({ ...base, zoom: 99 }).zoom, MAX_ZOOM);
assert.equal(clampCrop({ ...base, zoom: 0.2 }).zoom, 1);
// Une photo déjà en portrait.
{
  const r = cropRect({ width: 600, height: 1600, frameWidth: 300, frameHeight: 400, zoom: 1, x: 0, y: 0 });
  assert.ok(Math.abs(r.sw - 600) < 1e-6 && Math.abs(r.sh - 800) < 1e-6 && Math.abs(r.sy - 400) < 1e-6);
}

assert.equal(looksLikeImage({ type: "image/jpeg", name: "a" }), true);
assert.equal(looksLikeImage({ type: "", name: "IMG_1.HEIC" }), true);
assert.equal(looksLikeImage({ type: "application/pdf", name: "a.pdf" }), false);

// Date de naissance : jamais une date impossible.
assert.equal(daysInMonth(2024, 2), 29);
assert.equal(daysInMonth(2025, 2), 28);
assert.equal(isoFromParts("2015", "4", "12"), "2015-04-12");
assert.equal(isoFromParts("2015", "2", "30"), "");
assert.equal(isoFromParts("2015", "", "12"), "");
assert.deepEqual(partsFromIso("2015-04-02"), { year: "2015", month: "4", day: "2" });
assert.deepEqual(partsFromIso(""), { year: "", month: "", day: "" });
{
  const years = birthYears("2026-10-09");
  assert.equal(years[0], "2026");
  assert.equal(years[years.length - 1], "1990");
}

// Mot de passe : une aide, pas une règle.
assert.equal(passwordStrength(""), 0);
assert.equal(passwordStrength("abc"), 1);
assert.equal(passwordStrength("12345678"), 1);
assert.equal(passwordStrength("motdepasse"), 1);
assert.equal(passwordStrength("aaaaaaaa"), 1);
assert.ok(passwordStrength("Bonjour2026") >= 3);
assert.equal(passwordStrength("Tr0ub4dor&3-Soleil"), 4);
assert.ok(passwordStrength("abcdefgh") <= 2);

// Brouillon : jamais de mot de passe ni de photo, relecture sans rien présumer.
const draft = {
  parent: { nom: "Moukala", prenom: "Josiane", telephone: "061234567", email: "", profession: "", adresse: "", lien: "Mère" },
  children: [{ nom: "Moukala", prenom: "Alice", dateNaissance: "2015-04-12", lieuNaissance: "Brazzaville", classId: "c1" }],
  step: 1,
};
const text = serializeDraft(draft);
assert.ok(!/motDePasse|password|photo/i.test(text));
assert.deepEqual(parseDraft(text, 8), draft);
assert.equal(parseDraft(null, 8), null);
assert.equal(parseDraft("pas du json", 8), null);
assert.equal(parseDraft(JSON.stringify({ parent: {}, children: [], step: 0 }), 8), null, "un brouillon vide n'est pas un brouillon");
{
  const weird = parseDraft(JSON.stringify({ parent: { nom: 12, prenom: "A" }, children: [null, { nom: "B" }], step: 9 }), 8);
  assert.equal(weird.parent.nom, "");
  assert.equal(weird.parent.prenom, "A");
  assert.equal(weird.step, 0, "étape inconnue : on repart du début");
  assert.equal(weird.children.length, 2);
}
assert.equal(parseDraft(JSON.stringify({ parent: { nom: "X" }, children: Array.from({ length: 20 }, () => ({ nom: "Z" })), step: 2 }), 8).children.length, 8);
assert.equal(draftKey("abc"), "sa.famille.abc");

// Envoi multipart : le rang de la photo est celui de l'enfant dans l'envoi.
{
  const blob = new Blob(["x"], { type: "image/jpeg" });
  const form = buildFormData({ a: 1 }, [{ photo: null }, { photo: blob }, { photo: null }, { photo: blob }]);
  assert.equal(form.get("payload"), '{"a":1}');
  assert.equal(form.get("photo_0"), null);
  assert.ok(form.get("photo_1") instanceof Blob);
  assert.equal(form.get("photo_2"), null);
  assert.ok(form.get("photo_3") instanceof Blob);
}

console.log("collecte des familles : tous les contrôles passent");
