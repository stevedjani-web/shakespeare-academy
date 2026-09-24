// Contrôle de lib/parent-activation.ts : node scripts/check-parent-activation.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { whatsappDigits, activationUrl, parseActivationHash, whatsappLink, whatsappMessage } from "../lib/parent-activation.ts";

// Numéros : local à 9 chiffres complété, international gardé, le reste refusé.
assert.equal(whatsappDigits("06 123 45 67"), "242061234567");
assert.equal(whatsappDigits("061234567"), "242061234567");
assert.equal(whatsappDigits("+242 06 123 45 67"), "242061234567");
assert.equal(whatsappDigits("00242061234567"), "242061234567");
assert.equal(whatsappDigits("242061234567"), "242061234567");
assert.equal(whatsappDigits("+33 7 53 54 43 88"), "33753544388");
assert.equal(whatsappDigits("12345"), null);
assert.equal(whatsappDigits(""), null);

// Adresse d'activation : téléphone et code dans le fragment seulement.
const url = activationUrl("https://ecole-shakespeare.com", "06 123 45 67", "K7MQ-2XPA");
assert.ok(url.startsWith("https://ecole-shakespeare.com/parents/activer#"));
assert.ok(!url.split("#")[0].includes("K7MQ"), "le code ne doit jamais être dans la partie envoyée au serveur");
assert.deepEqual(parseActivationHash(new URL(url).hash), { telephone: "06 123 45 67", code: "K7MQ-2XPA" });
assert.equal(activationUrl("https://x.test"), "https://x.test/parents/activer");
assert.deepEqual(parseActivationHash(""), {});
assert.deepEqual(parseActivationHash("#code=ABCD-2345"), { code: "ABCD-2345" });

// Message WhatsApp : bilingue, avec le code, l'échéance et le lien ; pas de lien pour un numéro inutilisable.
const letter = { guardianId: "g1", nom: "Moukala", prenom: "Jean", telephone: "06 123 45 67", code: "K7MQ-2XPA", expireLe: "2026-10-21T12:00:00.000Z", enfants: [] };
const msg = whatsappMessage("Shakespeare Academy", letter, "https://ecole-shakespeare.com");
assert.ok(msg.includes("K7MQ-2XPA") && msg.includes("21/10/2026") && msg.includes("activation code") && msg.includes("code d'activation"));
const link = whatsappLink("Shakespeare Academy", letter, "https://ecole-shakespeare.com");
assert.ok(link && link.startsWith("https://wa.me/242061234567?text="));
assert.equal(whatsappLink("Shakespeare Academy", { ...letter, telephone: "123" }, "https://ecole-shakespeare.com"), null);

console.log("parent-activation : tous les contrôles passent");
