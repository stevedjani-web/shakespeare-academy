// Contrôle des règles du formulaire guidé des enseignants (aucun navigateur, aucun serveur).
import assert from "node:assert/strict";
import {
  EMPTY_TEACHER_FORM,
  blockingAlert,
  buildTeacherFormData,
  confirmationAlerts,
  draftOf,
  firstStepWithMissing,
  groupClasses,
  missingOnStep,
  needsSubjects,
  neighbourStep,
  phoneIsPlausible,
  restoreDraft,
  selectedClassNames,
  stepProgress,
  teacherFormUrl,
  teacherMissing,
  teacherShareMessage,
  teacherSteps,
} from "../lib/teacher-onboarding.ts";

const cls = (id, nom, cycle, secondaire, section = "Francophone") => ({ id, nom, niveau: nom, cycle, section, secondaire });
const CP = cls("c-cp", "CP", "Primaire", false);
const GS = cls("c-gs", "GS", "Maternelle", false);
const SIXIEME = cls("c-6", "6e A", "Collège", true);
const SECONDE = cls("c-2", "2nde C", "Lycée", true);
const CLASS1 = cls("c-en1", "Class 1", "Primaire", false, "Anglophone");
const OPTIONS = [GS, CP, SIXIEME, SECONDE, CLASS1];

const ok = { ...EMPTY_TEACHER_FORM, nom: "Kimpolo", prenom: "Régina", telephone: "+242 06 000 0001", classes: ["c-cp"], motDePasse: "MotDePasse1", confirmation: "MotDePasse1", consentement: true };

// --- règles de saisie (primaire : aucune matière demandée)
assert.deepEqual(teacherMissing(ok, true, false), [], "un formulaire complet est prêt");
assert.deepEqual(teacherMissing(EMPTY_TEACHER_FORM, false, false), ["nom", "prenom", "photo", "telephone", "classes", "motDePasse", "consentement"]);
assert.deepEqual(teacherMissing(ok, false, false), ["photo"], "la photo est obligatoire");
assert.deepEqual(teacherMissing({ ...ok, classes: [] }, true, false), ["classes"], "au moins une classe");
assert.deepEqual(teacherMissing({ ...ok, telephone: "1234567" }, true, false), ["telephone"], "moins de 8 chiffres");
assert.equal(phoneIsPlausible("06 000 0001"), true);
assert.equal(phoneIsPlausible("abc"), false);
assert.deepEqual(teacherMissing({ ...ok, email: "pas-un-email" }, true, false), ["email"]);
assert.deepEqual(teacherMissing({ ...ok, email: "regina@exemple.test" }, true, false), [], "l'e-mail est facultatif mais doit être valide");
assert.deepEqual(teacherMissing({ ...ok, urgenceTelephone: "123" }, true, false), ["urgenceTelephone"]);
assert.deepEqual(teacherMissing({ ...ok, motDePasse: "court", confirmation: "court" }, true, false), ["motDePasse"]);
assert.deepEqual(teacherMissing({ ...ok, confirmation: "Autre12345" }, true, false), ["confirmation"]);
assert.deepEqual(teacherMissing({ ...ok, consentement: false }, true, false), ["consentement"]);

// --- collège et lycée : les matières deviennent obligatoires, et seulement là
assert.equal(needsSubjects(OPTIONS, ["c-cp"]), false, "primaire : pas de matières");
assert.equal(needsSubjects(OPTIONS, ["c-gs", "c-en1"]), false, "maternelle et primaire anglophone : pas de matières");
assert.equal(needsSubjects(OPTIONS, ["c-6"]), true, "collège : matières");
assert.equal(needsSubjects(OPTIONS, ["c-2"]), true, "lycée : matières");
assert.equal(needsSubjects(OPTIONS, ["c-cp", "c-6"]), true, "une seule classe de collège suffit");
assert.equal(needsSubjects(OPTIONS, []), false);
assert.equal(needsSubjects(OPTIONS, ["inconnue"]), false);
assert.deepEqual(teacherMissing({ ...ok, classes: ["c-6"] }, true, true), ["matieres"]);
assert.deepEqual(teacherMissing({ ...ok, classes: ["c-6"], matieres: ["m1"] }, true, true), []);

// --- parcours : l'écran des matières n'existe que pour le secondaire
assert.deepEqual(teacherSteps(false), ["identity", "photo", "contact", "classes", "password", "review"]);
assert.deepEqual(teacherSteps(true), ["identity", "photo", "contact", "classes", "subjects", "password", "review"]);
assert.deepEqual(stepProgress("classes", false), { index: 4, total: 6 });
assert.deepEqual(stepProgress("password", true), { index: 6, total: 7 });
assert.equal(neighbourStep("welcome", false, 1), "identity");
assert.equal(neighbourStep("classes", false, 1), "password", "primaire : on saute les matières");
assert.equal(neighbourStep("classes", true, 1), "subjects");
assert.equal(neighbourStep("password", true, -1), "subjects");
assert.equal(neighbourStep("password", false, -1), "classes");
assert.equal(neighbourStep("welcome", false, -1), "welcome", "on ne recule pas avant l'accueil");
assert.equal(neighbourStep("review", false, 1), "review", "on n'avance pas après la vérification");

// --- erreurs affichées écran par écran
assert.deepEqual(missingOnStep("identity", EMPTY_TEACHER_FORM, false, false), ["nom", "prenom"]);
assert.deepEqual(missingOnStep("photo", ok, false, false), ["photo"]);
assert.deepEqual(missingOnStep("photo", ok, true, false), []);
assert.deepEqual(missingOnStep("contact", { ...ok, telephone: "" }, true, false), ["telephone"]);
assert.deepEqual(missingOnStep("classes", { ...ok, classes: [] }, true, false), ["classes"]);
assert.deepEqual(missingOnStep("subjects", ok, true, true), ["matieres"]);
assert.deepEqual(missingOnStep("password", { ...ok, motDePasse: "" }, true, false), ["motDePasse"]);
assert.equal(firstStepWithMissing(ok, true, false), null);
assert.equal(firstStepWithMissing({ ...ok, classes: ["c-6"] }, true, true), "subjects", "un besoin nouveau renvoie à l'écran concerné");
assert.equal(firstStepWithMissing(ok, false, false), "photo");

// --- classes : regroupées par section puis par cycle, dans l'ordre reçu
const groups = groupClasses(OPTIONS);
assert.deepEqual(groups.map((g) => g.section), ["Francophone", "Anglophone"]);
assert.deepEqual(groups[0].cycles.map((c) => c.cycle), ["Maternelle", "Primaire", "Collège", "Lycée"]);
assert.deepEqual(groups[0].cycles.map((c) => c.secondaire), [false, false, true, true]);
assert.deepEqual(selectedClassNames(OPTIONS, ["c-6", "c-gs"]), ["GS", "6e A"], "dans l'ordre de la structure, pas de la sélection");

// --- envoi : le JSON est dans « payload », un champ vide est omis, la photo est jointe, les matières seulement au secondaire
const form = { ...ok, email: "  ", urgenceNom: "Paul", matieres: ["m1"] };
const photo = new Blob(["x"], { type: "image/jpeg" });
const primary = buildTeacherFormData(form, "v1", photo, false);
const payload = JSON.parse(primary.get("payload"));
assert.equal(payload.versionPolitique, "v1");
assert.equal("email" in payload, false, "un e-mail vide n'est pas envoyé");
assert.equal(payload.urgenceNom, "Paul");
assert.deepEqual(payload.classes, ["c-cp"]);
assert.deepEqual(payload.matieres, [], "primaire : aucune matière n'est envoyée");
assert.equal("confirmation" in payload, false, "la confirmation du mot de passe ne part pas");
assert.equal(primary.has("photo"), true, "la photo part toujours");
const secondary = JSON.parse(buildTeacherFormData({ ...form, classes: ["c-6"] }, "v1", photo, true).get("payload"));
assert.deepEqual(secondary.matieres, ["m1"], "secondaire : les matières sont envoyées");

// --- brouillon : ni mot de passe, ni accord, ni photo ; seulement des valeurs qui existent encore
const draft = draftOf("contact", { ...ok, matieres: ["m1"], email: "a@b.cd" });
assert.equal("motDePasse" in draft.form, false);
assert.equal("confirmation" in draft.form, false);
assert.equal("consentement" in draft.form, false);
assert.equal(JSON.stringify(draft).includes("MotDePasse1"), false, "le mot de passe n'est jamais gardé");
const back = restoreDraft(JSON.parse(JSON.stringify(draft)), ["c-cp", "c-6"], ["m1"]);
assert.equal(back.step, "photo", "tout écran après la photo ramène à la photo : elle n'est pas gardée");
assert.equal(restoreDraft(draftOf("identity", ok), ["c-cp"], []).step, "identity", "avant la photo, on reprend où on en était");
assert.equal(restoreDraft(draftOf("welcome", ok), ["c-cp"], []).step, "welcome");
assert.equal(back.form.prenom, "Régina");
assert.equal(back.form.motDePasse, "");
assert.equal(back.form.consentement, false);
assert.deepEqual(back.form.classes, ["c-cp"]);
const pruned = restoreDraft(JSON.parse(JSON.stringify(draft)), ["c-6"], []);
assert.deepEqual(pruned.form.classes, [], "une classe disparue est retirée");
assert.deepEqual(pruned.form.matieres, [], "une matière disparue est retirée");
assert.equal(restoreDraft({ step: "review", form: draft.form }, ["c-cp"], []).step, "photo", "la photo n'est pas gardée : on revient à son écran");
assert.equal(restoreDraft({ step: "n'importe quoi", form: draft.form }, [], []), null);
assert.equal(restoreDraft(null, [], []), null);
assert.equal(restoreDraft({ step: "contact" }, [], []), null);

assert.equal(teacherFormUrl("https://ecole-shakespeare.com/", "abc"), "https://ecole-shakespeare.com/enseignants/abc");
const message = teacherShareMessage("https://x/enseignants/abc", "Shakespeare Academy");
assert.match(message, /Bonjour/);
assert.match(message, /Hello/);
assert.match(message, /photo/);
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
