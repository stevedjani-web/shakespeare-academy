// Contrôle des règles d'affichage de l'activité des parents (aucun navigateur, aucun serveur).
import { activityState, classesOf, filterParents, matchesQuery, parentName, relativeTime } from "../lib/parent-activity.ts";

let failures = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`);
}

const child = (prenom, nom, classe) => ({ id: prenom, nom, prenom, matricule: "0001" + prenom.length, classe });
const row = (o) => ({ accountId: o.nom, nom: o.nom, prenom: "Parent", telephone: o.tel ?? "242060000001", statut: "ACTIF", activeLe: "2026-10-01T00:00:00Z", dernierLoginAt: null, connexions: 0, enfants: [], ...o });

eq("désactivé prime sur tout", activityState({ statut: "INACTIF", dernierLoginAt: "2026-10-01", connexions: 3 }), "disabled");
eq("jamais connecté", activityState({ statut: "ACTIF", dernierLoginAt: null, connexions: 0 }), "never");
eq("connecté sur la période", activityState({ statut: "ACTIF", dernierLoginAt: "2026-10-20", connexions: 2 }), "connected");
eq("déjà venu, pas revenu", activityState({ statut: "ACTIF", dernierLoginAt: "2026-08-20", connexions: 0 }), "away");

const a = row({ nom: "Moukala", tel: "242060000001", dernierLoginAt: "2026-10-20", connexions: 2, enfants: [child("Alice", "Moukala", "CM2"), child("Brice", "Moukala", "6e")] });
const b = row({ nom: "Zola", tel: "242 06 000 0002", enfants: [child("Carine", "Zola", "CM2")] });
const c = row({ nom: "Nzila", statut: "INACTIF", enfants: [child("Diane", "Nzila", "CE1")] });
const rows = [a, b, c];

eq("recherche sans accent ni casse", matchesQuery(a, "ALICE"), true);
eq("recherche par nom du parent", matchesQuery(b, "zola"), true);
eq("recherche par téléphone écrit avec des espaces", matchesQuery(b, "06 000 0002"), true);
eq("recherche absente", matchesQuery(a, "xyz"), false);
eq("recherche vide = tout", matchesQuery(a, "  "), true);
eq("filtre jamais connectés", filterParents(rows, { query: "", state: "never", classe: "" }).map((r) => r.nom), ["Zola"]);
eq("filtre connectés", filterParents(rows, { query: "", state: "connected", classe: "" }).map((r) => r.nom), ["Moukala"]);
eq("filtre désactivés", filterParents(rows, { query: "", state: "disabled", classe: "" }).map((r) => r.nom), ["Nzila"]);
eq("filtre classe (un parent a un enfant dans la classe)", filterParents(rows, { query: "", state: "all", classe: "6e" }).map((r) => r.nom), ["Moukala"]);
eq("filtres combinés", filterParents(rows, { query: "carine", state: "never", classe: "CM2" }).map((r) => r.nom), ["Zola"]);
eq("classes triées", classesOf(rows), ["6e", "CE1", "CM2"]);
eq("nom complet", parentName({ nom: "Losseki", prenom: "Nadine" }), "Nadine Losseki");
eq("nom sans prénom", parentName({ nom: "Losseki", prenom: null }), "Losseki");

const now = new Date("2026-10-21T12:00:00Z");
eq("à l'instant", relativeTime("2026-10-21T11:59:40Z", now, "fr"), "maintenant");
eq("il y a 2 heures", relativeTime("2026-10-21T10:00:00Z", now, "fr"), "il y a 2 heures");
eq("hier", relativeTime("2026-10-20T12:00:00Z", now, "fr"), "hier");
eq("il y a 5 jours", relativeTime("2026-10-16T12:00:00Z", now, "fr"), "il y a 5 jours");
eq("en anglais", relativeTime("2026-10-16T12:00:00Z", now, "en"), "5 days ago");

if (failures) {
  console.error(`${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("activité des parents : tous les contrôles passent");
