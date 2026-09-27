// Contrôle de lib/pre-registration-form.ts : node scripts/check-pre-registration-form.mjs
import assert from "node:assert/strict";
import { childInitials, childMissing, childSwatch } from "../lib/pre-registration-form.ts";
import { SWATCHES } from "../lib/subject-colors.ts";

const TODAY = "2026-09-27";
const base = {
  key: "k", nom: "Moukala", prenom: "Alice", sexe: "F", dateNaissance: "2018-04-12", lieuNaissance: "", levelId: "l1",
  typeEleve: "NOUVEAU", ancienEtablissement: "", classePrecedenteLevelId: "", bulletin: null, bulletinError: null,
};

// Une fiche complète n'a rien à signaler ; l'ancien établissement et le bulletin restent facultatifs.
assert.deepEqual(childMissing(base, TODAY), []);
assert.deepEqual(childMissing({ ...base, ancienEtablissement: "", bulletin: null }, TODAY), []);

// Chaque champ obligatoire est signalé, séparément, y compris un espace seul.
for (const field of ["nom", "prenom"]) assert.deepEqual(childMissing({ ...base, [field]: "  " }, TODAY), [field]);
assert.deepEqual(childMissing({ ...base, sexe: "" }, TODAY), ["sexe"]);
assert.deepEqual(childMissing({ ...base, levelId: "" }, TODAY), ["levelId"]);
assert.deepEqual(childMissing({ ...base, typeEleve: "" }, TODAY), ["typeEleve"]);
assert.deepEqual(childMissing({ ...base, dateNaissance: "" }, TODAY), ["dateNaissance"]);
// Une date de naissance dans le futur est refusée, celle du jour est acceptée.
assert.deepEqual(childMissing({ ...base, dateNaissance: "2099-01-01" }, TODAY), ["dateNaissance"]);
assert.deepEqual(childMissing({ ...base, dateNaissance: TODAY }, TODAY), []);

// Ancien élève : la classe de l'année précédente est obligatoire ; nouvel élève : jamais demandée.
assert.deepEqual(childMissing({ ...base, typeEleve: "ANCIEN" }, TODAY), ["classePrecedenteLevelId"]);
assert.deepEqual(childMissing({ ...base, typeEleve: "ANCIEN", classePrecedenteLevelId: "l0" }, TODAY), []);
assert.deepEqual(childMissing({ ...base, typeEleve: "NOUVEAU", classePrecedenteLevelId: "" }, TODAY), []);

// Fiche entièrement vide : tout ce qui est obligatoire est signalé, dans l'ordre du formulaire.
assert.deepEqual(childMissing({ ...base, nom: "", prenom: "", sexe: "", dateNaissance: "", levelId: "", typeEleve: "" }, TODAY), [
  "nom", "prenom", "sexe", "dateNaissance", "levelId", "typeEleve",
]);

// Initiales : deux lettres en majuscules, ou le rang tant que le nom est vide.
assert.equal(childInitials({ nom: "moukala", prenom: "alice" }, 0), "AM");
assert.equal(childInitials({ nom: "", prenom: "" }, 2), "3");
assert.equal(childInitials({ nom: "Ba", prenom: "" }, 0), "B");

// Chaque enfant a sa teinte, deux voisins ne se confondent pas, et l'on repart du début après huit enfants.
const swatches = Array.from({ length: 8 }, (_, i) => childSwatch(i));
assert.equal(new Set(swatches.map((s) => s.bg)).size, 8);
assert.deepEqual(childSwatch(8), childSwatch(0));
assert.ok(swatches.every((s) => Object.values(SWATCHES).includes(s)));

console.log("formulaire de préinscription : tous les contrôles passent");
