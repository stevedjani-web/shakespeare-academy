// Contrôle de lib/parent-alerts.ts : node scripts/check-parent-alerts.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { alertTitle, notificationTarget } from "../lib/parent-alerts.ts";
import { interpolate } from "../lib/i18n/interpolate.ts";
import { fr } from "../lib/i18n/messages/fr.ts";
import { en } from "../lib/i18n/messages/en.ts";

const inFr = (key, params) => interpolate(fr[key], params);
const inEn = (key, params) => interpolate(en[key], params);

// Titre en français : singulier, pluriel, messages seuls, notifications seules, les deux.
assert.equal(alertTitle(0, 0, inFr), "");
assert.equal(alertTitle(1, 0, inFr), "Vous avez un nouveau message");
assert.equal(alertTitle(3, 0, inFr), "Vous avez 3 nouveaux messages");
assert.equal(alertTitle(0, 1, inFr), "Vous avez une notification non lue");
assert.equal(alertTitle(0, 2, inFr), "Vous avez 2 notifications non lues");
assert.equal(alertTitle(2, 1, inFr), "Vous avez 2 nouveaux messages et une notification non lue");
assert.equal(alertTitle(1, 2, inFr), "Vous avez un nouveau message et 2 notifications non lues");

// Le même titre en anglais.
assert.equal(alertTitle(1, 0, inEn), "You have a new message");
assert.equal(alertTitle(3, 0, inEn), "You have 3 new messages");
assert.equal(alertTitle(0, 1, inEn), "You have an unread notification");
assert.equal(alertTitle(2, 1, inEn), "You have 2 new messages and an unread notification");

// Cible : messagerie, annonces, sinon la fiche de l'enfant.
assert.equal(notificationTarget("MESSAGE_RECU", "e1"), "/parents/messages");
assert.equal(notificationTarget("ANNONCE", "e1"), "/parents/annonces");
for (const t of ["ABSENCE", "RETARD", "ENSEIGNANT_ABSENT", "EMPLOI_DU_TEMPS_MODIFIE", "BULLETIN_DISPONIBLE", "DEVOIR_DONNE", "DISCIPLINE"]) {
  assert.equal(notificationTarget(t, "e1"), "/parents/enfant/e1");
}

console.log("parent-alerts : tous les contrôles passent");
