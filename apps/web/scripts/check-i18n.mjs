// Contrôle de lib/i18n : node scripts/check-i18n.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { detectLocale, isLocale, INTL_LOCALE } from "../lib/i18n/locales.ts";
import { interpolate } from "../lib/i18n/interpolate.ts";
import { fr } from "../lib/i18n/messages/fr.ts";
import { en } from "../lib/i18n/messages/en.ts";

// Langue de l'appareil : la première langue préférée prise en charge, le français sinon.
assert.equal(detectLocale(["en-US", "fr-FR"]), "en");
assert.equal(detectLocale(["fr-CG"]), "fr");
assert.equal(detectLocale(["de-DE", "en-GB"]), "en", "saute une langue non prise en charge");
assert.equal(detectLocale(["de-DE", "es"]), "fr", "aucune langue prise en charge : le français");
assert.equal(detectLocale([]), "fr");
assert.equal(detectLocale(undefined), "fr");
assert.equal(detectLocale(["EN_gb"]), "en", "casse et séparateur tolérés");
assert.equal(isLocale("fr"), true);
assert.equal(isLocale("de"), false);
assert.equal(isLocale(null), false);
assert.equal(INTL_LOCALE.en, "en-GB");

// Paramètres : remplacés, un oubli reste visible.
assert.equal(interpolate("Bonjour {name}", { name: "Alice" }), "Bonjour Alice");
assert.equal(interpolate("{a} + {b} = {a}", { a: 1, b: 2 }), "1 + 2 = 1");
assert.equal(interpolate("Bonjour {name}", {}), "Bonjour {name}");
assert.equal(interpolate("Sans paramètre", undefined), "Sans paramètre");

// Les deux dictionnaires ont exactement les mêmes clés, aucun texte vide, les mêmes paramètres et le même gras.
const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
assert.deepEqual(enKeys, frKeys, "les clés du français et de l'anglais diffèrent");
const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const key of frKeys) {
  assert.ok(fr[key].trim().length > 0, `texte français vide : ${key}`);
  assert.ok(en[key].trim().length > 0, `texte anglais vide : ${key}`);
  assert.equal(params(en[key]), params(fr[key]), `paramètres différents pour ${key}`);
  assert.equal(en[key].split("**").length % 2, 1, `gras mal fermé (anglais) : ${key}`);
  assert.equal(fr[key].split("**").length % 2, 1, `gras mal fermé (français) : ${key}`);
}

console.log(`i18n : ${frKeys.length} clés, tous les contrôles passent`);

// Montant en toutes lettres, anglais britannique.
import { numberToWordsEn } from "../lib/number-to-words-en.ts";
const words = [
  [0, "zero"], [1, "one"], [13, "thirteen"], [21, "twenty-one"], [100, "one hundred"], [101, "one hundred and one"],
  [1000, "one thousand"], [1001, "one thousand and one"], [1050, "one thousand and fifty"], [1250, "one thousand two hundred and fifty"],
  [45000, "forty-five thousand"], [110000, "one hundred and ten thousand"], [375000, "three hundred and seventy-five thousand"],
  [1000000, "one million"], [1000005, "one million and five"], [2500000, "two million five hundred thousand"],
  [1234567, "one million two hundred and thirty-four thousand five hundred and sixty-seven"],
];
for (const [n, text] of words) assert.equal(numberToWordsEn(n), text, `montant ${n}`);
console.log("montants en anglais : tous les contrôles passent");
