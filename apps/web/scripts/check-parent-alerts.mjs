// Contrôle de lib/parent-alerts.ts : node scripts/check-parent-alerts.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { alertTitle, notificationTarget } from "../lib/parent-alerts.ts";

// Titre : singulier, pluriel, messages seuls, notifications seules, les deux.
assert.equal(alertTitle(0, 0), "");
assert.equal(alertTitle(1, 0), "Vous avez un nouveau message");
assert.equal(alertTitle(3, 0), "Vous avez 3 nouveaux messages");
assert.equal(alertTitle(0, 1), "Vous avez une notification non lue");
assert.equal(alertTitle(0, 2), "Vous avez 2 notifications non lues");
assert.equal(alertTitle(2, 1), "Vous avez 2 nouveaux messages et une notification non lue");
assert.equal(alertTitle(1, 2), "Vous avez un nouveau message et 2 notifications non lues");

// Cible : messagerie, annonces, sinon la fiche de l'enfant.
assert.equal(notificationTarget("MESSAGE_RECU", "e1"), "/parents/messages");
assert.equal(notificationTarget("ANNONCE", "e1"), "/parents/annonces");
for (const t of ["ABSENCE", "RETARD", "ENSEIGNANT_ABSENT", "EMPLOI_DU_TEMPS_MODIFIE", "BULLETIN_DISPONIBLE", "DEVOIR_DONNE", "DISCIPLINE"]) {
  assert.equal(notificationTarget(t, "e1"), "/parents/enfant/e1");
}

console.log("parent-alerts : tous les contrôles passent");
