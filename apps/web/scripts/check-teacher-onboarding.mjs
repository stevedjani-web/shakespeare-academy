// Contrôle des règles du formulaire des enseignants (aucun navigateur, aucun serveur).
import assert from "node:assert/strict";
import { EMPTY_TEACHER_FORM, blockingAlert, buildTeacherFormData, confirmationAlerts, phoneIsPlausible, teacherFormUrl, teacherMissing, teacherShareMessage } from "../lib/teacher-onboarding.ts";

const ok = { ...EMPTY_TEACHER_FORM, nom: "Kimpolo", prenom: "Régina", telephone: "+242 06 000 0001", motDePasse: "MotDePasse1", confirmation: "MotDePasse1", consentement: true };

assert.deepEqual(teacherMissing(ok), [], "un formulaire complet est prêt");
assert.deepEqual(teacherMissing(EMPTY_TEACHER_FORM), ["nom", "prenom", "telephone", "motDePasse", "consentement"]);
assert.deepEqual(teacherMissing({ ...ok, telephone: "1234567" }), ["telephone"], "moins de 8 chiffres");
assert.equal(phoneIsPlausible("06 000 0001"), true);
assert.equal(phoneIsPlausible("abc"), false);
assert.deepEqual(teacherMissing({ ...ok, email: "pas-un-email" }), ["email"]);
assert.deepEqual(teacherMissing({ ...ok, email: "regina@exemple.test" }), [], "l'e-mail est facultatif mais doit être valide");
assert.deepEqual(teacherMissing({ ...ok, urgenceTelephone: "123" }), ["urgenceTelephone"]);
assert.deepEqual(teacherMissing({ ...ok, motDePasse: "court", confirmation: "court" }), ["motDePasse"]);
assert.deepEqual(teacherMissing({ ...ok, confirmation: "Autre12345" }), ["confirmation"]);
assert.deepEqual(teacherMissing({ ...ok, consentement: false }), ["consentement"]);

// Envoi : le JSON est dans « payload », un champ vide est omis, la photo est jointe sous « photo ».
const form = { ...ok, email: "  ", urgenceNom: "Paul", matieres: ["m1"] };
const withoutPhoto = buildTeacherFormData(form, "v1", null);
const payload = JSON.parse(withoutPhoto.get("payload"));
assert.equal(payload.versionPolitique, "v1");
assert.equal("email" in payload, false, "un e-mail vide n'est pas envoyé");
assert.equal(payload.urgenceNom, "Paul");
assert.deepEqual(payload.matieres, ["m1"]);
assert.equal("confirmation" in payload, false, "la confirmation du mot de passe ne part pas");
assert.equal(withoutPhoto.has("photo"), false);
assert.equal(buildTeacherFormData(form, "v1", new Blob(["x"], { type: "image/jpeg" })).has("photo"), true);

assert.equal(teacherFormUrl("https://ecole-shakespeare.com/", "abc"), "https://ecole-shakespeare.com/enseignants/abc");
const message = teacherShareMessage("https://x/enseignants/abc", "Shakespeare Academy");
assert.match(message, /Bonjour/);
assert.match(message, /Hello/);
assert.equal(message.split("https://x/enseignants/abc").length - 1, 2, "le lien figure en français et en anglais");

const alerts = [
  { code: "A", gravite: "INFO", message: "i" },
  { code: "B", gravite: "CONFIRMATION", message: "c" },
  { code: "C", gravite: "BLOQUANT", message: "b" },
];
assert.equal(blockingAlert(alerts)?.code, "C");
assert.deepEqual(confirmationAlerts(alerts).map((a) => a.code), ["B"]);
assert.equal(blockingAlert(alerts.slice(0, 2)), undefined);

console.log("collecte des enseignants : tous les contrôles passent");
