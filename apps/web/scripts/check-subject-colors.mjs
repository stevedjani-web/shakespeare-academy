// Contrôle de lib/subject-colors.ts : node scripts/check-subject-colors.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { SUBJECT_COLOR_KEYS, SWATCHES, isSubjectColor, resolveSubjectColor, subjectCellStyle } from "../lib/subject-colors.ts";

const HEX = /^#[0-9a-f]{6}$/i;
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Chaque teinte du serveur a ses trois couleurs, et le texte est lisible sur le fond (7 pour 1, plus que le minimum de 4,5).
assert.equal(SUBJECT_COLOR_KEYS.length, 12);
assert.equal(new Set(SUBJECT_COLOR_KEYS).size, 12);
for (const key of SUBJECT_COLOR_KEYS) {
  const s = SWATCHES[key];
  assert.ok(s && HEX.test(s.bg) && HEX.test(s.border) && HEX.test(s.text), `teinte incomplète : ${key}`);
  assert.ok(contrast(s.text, s.bg) >= 7, `contraste insuffisant (${contrast(s.text, s.bg).toFixed(2)}) : ${key}`);
}
// Deux teintes différentes ne se confondent pas : les fonds sont tous distincts.
assert.equal(new Set(SUBJECT_COLOR_KEYS.map((k) => SWATCHES[k].bg)).size, 12);

// Une couleur choisie l'emporte ; une valeur inconnue ou vide retombe sur l'automatique, toujours la même.
assert.equal(resolveSubjectColor("blue", "ANGL2"), "blue");
assert.equal(resolveSubjectColor("red", "FRAN2"), "red");
assert.equal(isSubjectColor("fuchsia"), false);
assert.equal(isSubjectColor(null), false);
for (const code of ["ANGL2", "FRAN2", "PC", "", undefined]) {
  const first = resolveSubjectColor(null, code);
  assert.equal(resolveSubjectColor(undefined, code), first);
  assert.equal(resolveSubjectColor("fuchsia", code), first);
  assert.ok(isSubjectColor(first));
  assert.notEqual(first, "gray", "le gris n'est jamais donné automatiquement");
}
// Les quinze matières de l'école en production ont des teintes automatiques réparties, pas toutes la même.
const codes = ["ANGL2", "CHIM", "ESP", "FRAN3", "FRLIT", "HGEO", "INFO", "FRAN2", "MATH_GEO", "MATH2", "PHYS", "PC", "SVT", "EPS1", "ETUDE"];
assert.ok(new Set(codes.map((c) => resolveSubjectColor(null, c))).size >= 6, "teintes automatiques trop peu variées");

const style = subjectCellStyle("blue", "ANGL2");
assert.deepEqual(style, { backgroundColor: SWATCHES.blue.bg, borderLeft: `4px solid ${SWATCHES.blue.border}`, color: SWATCHES.blue.text });
console.log("couleurs des matières : tous les contrôles passent");
