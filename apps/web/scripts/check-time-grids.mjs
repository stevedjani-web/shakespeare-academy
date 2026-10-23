// Contrôle de lib/time-grids.ts : node scripts/check-time-grids.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { gridKey, slotsForLevel, slotsOfUsedGrids } from "../lib/time-grids.ts";

const slot = (id, sectionId, gridId) => ({ id, sectionId, gridId });
const common = slot("c1", null, null);
const common2 = slot("c2", null, null);
const sectionOwn = slot("s1", "SEC", null);
const grid = slot("g1", null, "G");
const grid2 = slot("g2", null, "G");
const otherGrid = slot("o1", null, "H");
const all = [common, common2, sectionOwn, grid, grid2, otherGrid];

// Un niveau avec une grille nommée prend uniquement les créneaux de cette grille.
assert.deepEqual(slotsForLevel(all, { gridId: "G" }, "SEC").map((s) => s.id), ["g1", "g2"]);
// Sans grille nommée, la grille de la section prime sur la commune.
assert.deepEqual(slotsForLevel(all, { gridId: null }, "SEC").map((s) => s.id), ["s1"]);
// Une section sans créneaux propres retombe sur la grille commune (les grilles nommées n'y entrent jamais).
assert.deepEqual(slotsForLevel(all, { gridId: null }, "AUTRE").map((s) => s.id), ["c1", "c2"]);
assert.deepEqual(slotsForLevel(all, undefined, undefined).map((s) => s.id), ["c1", "c2"]);
// Une grille nommée vide ne retombe pas sur la grille commune : la classe n'a simplement pas de créneau.
assert.deepEqual(slotsForLevel(all, { gridId: "VIDE" }, "SEC"), []);

assert.equal(gridKey(common), "common");
assert.equal(gridKey(sectionOwn), "s:SEC");
assert.equal(gridKey(grid), "g:G");

// Vue enseignant ou salle : les grilles dont une séance se sert.
assert.deepEqual(slotsOfUsedGrids(all, [{ timeSlotId: "g1" }]).map((s) => s.id), ["g1", "g2"]);
assert.deepEqual(slotsOfUsedGrids(all, [{ timeSlotId: "g1" }, { timeSlotId: "c1" }]).map((s) => s.id), ["c1", "c2", "g1", "g2"]);
assert.equal(slotsOfUsedGrids(all, []).length, all.length, "sans séance, tout est montré");
assert.equal(slotsOfUsedGrids(all, [{ timeSlotId: "inconnu" }]).length, all.length);

console.log("grilles horaires : tous les contrôles passent");
