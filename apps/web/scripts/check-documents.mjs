// Contrôle de lib/documents.ts : node scripts/check-documents.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import { attestationText, formatDocDate, safeFileName, shortUrl, signerTitle, verifyUrl } from "../lib/documents.ts";

const doc = (over = {}, eleve = {}, directeur = {}) => ({
  id: "d1",
  studentId: "s1",
  type: "ATTESTATION_SCOLARITE",
  numero: "ATT-2026-000012",
  verificationToken: "tok123",
  dateEmission: "2026-09-24T09:30:00.000Z",
  annuleLe: null,
  motifAnnulation: null,
  emisParType: "STAFF",
  snapshot: {
    eleve: { nom: "Moukala", prenom: "Alice", sexe: "F", dateNaissance: "2015-04-12", lieuNaissance: "Pointe-Noire", matricule: "000042", ...eleve },
    classe: "CM2 A",
    annee: { libelle: "2026-2027", debut: "2026-09-01", fin: "2027-06-30" },
    ecole: { nom: "Shakespeare Academy", adresse: null, telephone: null, logoUrl: null },
    directeur: { nom: "Marie Ndinga", titre: "La Directrice", ville: "Brazzaville", signatureUrl: null, ...directeur },
    echeance: "2027-06-30",
  },
  ...over,
});

// Dates.
assert.equal(formatDocDate("2015-04-12", "fr"), "12/04/2015");
assert.equal(formatDocDate("2026-09-24T09:30:00.000Z", "fr"), "24/09/2026");
assert.equal(formatDocDate("2015-04-12", "en"), "12 April 2015");
assert.equal(formatDocDate("2026-01-05", "en"), "5 January 2026");

// Attestation en français : accords selon le sexe, lieu de naissance facultatif.
const url = verifyUrl("https://academy.lobima.online", "tok123");
assert.equal(url, "https://academy.lobima.online/verifier-document/tok123");
const fr = attestationText(doc(), "fr", url);
assert.equal(fr.title, "ATTESTATION DE SCOLARITÉ");
assert.match(fr.paragraphs[0], /Je soussigné\(e\), Marie Ndinga, la Directrice de Shakespeare Academy/);
assert.match(fr.paragraphs[0], /l'élève Alice MOUKALA, née le 12\/04\/2015 à Pointe-Noire, matricule 000042/);
assert.match(fr.paragraphs[0], /régulièrement inscrite en classe de CM2 A pour l'année scolaire 2026-2027/);
assert.equal(fr.place, "Fait à Brazzaville, le 24/09/2026");
assert.equal(fr.signerTitle, "La Directrice");
assert.ok(fr.verifyNote.includes("ATT-2026-000012") && fr.verifyNote.includes(url));

const frM = attestationText(doc({}, { sexe: "M", prenom: "Paul", lieuNaissance: null }), "fr", url);
assert.match(frM.paragraphs[0], /l'élève Paul MOUKALA, né le 12\/04\/2015, matricule/);
assert.doesNotMatch(frM.paragraphs[0], / à null/);
assert.match(frM.paragraphs[0], /régulièrement inscrit en classe/);

// En anglais.
const en = attestationText(doc(), "en", url);
assert.equal(en.title, "CERTIFICATE OF ENROLLMENT");
assert.match(en.paragraphs[0], /I, the undersigned, Marie Ndinga, the Headmistress of Shakespeare Academy, certify that Alice MOUKALA, born on 12 April 2015 in Pointe-Noire/);
assert.equal(en.place, "Issued in Brazzaville, on 24 September 2026");
assert.equal(en.signerTitle, "The Headmistress");
// Un titre personnalisé est repris tel quel.
assert.equal(signerTitle("Proviseur", "en"), "proviseur");
assert.equal(signerTitle("Le Directeur", "en"), "the Headmaster");
assert.equal(signerTitle("Le Directeur", "fr"), "le Directeur");

// Adresses et noms de fichier.
assert.equal(shortUrl("https://a.test/x"), "a.test/x");
assert.equal(safeFileName("Attestation", "Moukala Alice", "Élève"), "Attestation-Moukala-Alice-Eleve");

// Rien d'inventé quand le directeur n'est pas nommé : le texte reste sans "null".
const noName = attestationText(doc({}, {}, { nom: null, ville: null }), "fr", url);
assert.doesNotMatch(noName.paragraphs[0] + noName.place, /null/);

console.log("documents : ok");
