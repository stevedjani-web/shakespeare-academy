// Contrôle des fonctions pures de la cantine (sélection des jours, total, mois). `node scripts/check-canteen.mjs`
import assert from "node:assert/strict";
import {
  addDaysIso,
  allSellable,
  keepSellable,
  monthOf,
  nextSellable,
  saleTotal,
  shiftMonth,
  toggleDay,
  weekdayName,
} from "../lib/canteen.ts";

const day = (date, extra = {}) => ({ date, paye: false, ferme: false, motifFermeture: null, ...extra });
const days = [
  day("2026-11-02", { paye: true }),
  day("2026-11-03"),
  day("2026-11-05", { ferme: true, motifFermeture: "Férié" }),
  day("2026-11-09"),
  day("2026-11-10"),
  day("2026-11-12"),
];

// Un mois complet = ses jours réels : ni les jours déjà payés, ni les jours sans classe.
assert.deepEqual(allSellable(days), ["2026-11-03", "2026-11-09", "2026-11-10", "2026-11-12"]);

// Les N prochains jours vendables, à partir d'une date (comprise).
assert.deepEqual(nextSellable(days, 2, "2026-11-04"), ["2026-11-09", "2026-11-10"]);
assert.deepEqual(nextSellable(days, 3, "2026-11-10"), ["2026-11-10", "2026-11-12"]);
assert.deepEqual(nextSellable(days, 0, "2026-11-01"), []);

// Sélection : ajout et retrait, toujours triée, sans doublon.
assert.deepEqual(toggleDay(["2026-11-09"], "2026-11-03"), ["2026-11-03", "2026-11-09"]);
assert.deepEqual(toggleDay(["2026-11-03", "2026-11-09"], "2026-11-03"), ["2026-11-09"]);

// Après un rechargement, un jour devenu payé ou fermé sort de la sélection.
assert.deepEqual(keepSellable(["2026-11-02", "2026-11-03", "2026-11-05"], days), ["2026-11-03"]);

// Montant en entiers.
assert.equal(saleTotal(12, 1000), 12000);
assert.equal(saleTotal(0, 1000), 0);

// Navigation entre mois, y compris à cheval sur deux années.
assert.equal(shiftMonth("2026-11", 1), "2026-12");
assert.equal(shiftMonth("2026-12", 1), "2027-01");
assert.equal(shiftMonth("2027-01", -1), "2026-12");
assert.equal(shiftMonth("2026-03", -3), "2025-12");
assert.equal(monthOf("2026-11-09"), "2026-11");
assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");

// Les jours de la semaine suivent la numérotation du serveur (0 = dimanche).
assert.equal(weekdayName(1, "fr-FR"), "lundi");
assert.equal(weekdayName(4, "fr-FR"), "jeudi");
assert.equal(weekdayName(1, "en-GB"), "Monday");
assert.equal(weekdayName(0, "en-GB", "short"), "Sun");

console.log("check-canteen : OK");
