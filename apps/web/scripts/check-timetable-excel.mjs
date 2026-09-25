// Contrôle de lib/timetable-excel.ts : node scripts/check-timetable-excel.mjs (Node exécute le TypeScript directement).
import assert from "node:assert/strict";
import {
  buildGridSheets,
  buildHoursSheets,
  computeTeacherHours,
  hourLabel,
  minutesOf,
  rangeLabel,
  sheetName,
} from "../lib/timetable-excel.ts";

const labels = {
  classLabel: "Classe :", yearLabel: "Année scolaire :", title: "EMPLOI DU TEMPS", daysHeader: "Jours\nHoraire", pause: "PAUSE",
  days: { 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi" },
  hoursTitle: "Heures 2026/2027 (v1)", colTeacher: "Enseignant", colSubjects: "Matières", colClasses: "Classes", colSessions: "Séances",
  colHours: "Heures", colClass: "Classe", colSubject: "Matière", total: "TOTAL", noSession: "Aucune séance",
  sheetTotal: "Total", sheetDetail: "Détail", sheetDay: "Par jour", detailTitle: "Détail", dayTitle: "Par jour",
};
const T1 = { id: "t1", nom: "MBIDA", prenom: "Maxime" };
const T2 = { id: "t2", nom: "CEDRIC", prenom: "P" };
const T3 = { id: "t3", nom: "IKENGUISSI", prenom: "Velda" };
const klass = (id, nom) => ({ id, nom });
const classes = [klass("c6", "6e"), klass("c5", "5e"), klass("c2", "2nde C")];
const entry = (classId, nom, jour, debut, fin, subject, teacher) => ({ classId, jourSemaine: jour, heureDebut: debut, heureFin: fin, class: { nom }, subject: { nom: subject }, teacher });
const entries = [
  entry("c6", "6e", 1, "08:00", "09:00", "Français", T1),
  entry("c6", "6e", 1, "09:00", "10:00", "Français", T1),
  entry("c6", "6e", 2, "10:30", "11:30", "Histoire-Géographie", T2),
  entry("c5", "5e", 1, "08:00", "09:00", "Français", T1),
  entry("c5", "5e", 3, "13:30", "15:00", "Histoire-Géographie", T2), // une séance de 1 h 30
];
const slots = [
  { heureDebut: "10:00", heureFin: "10:30", type: "PAUSE" },
  { heureDebut: "09:00", heureFin: "10:00", type: "COURS" },
  { heureDebut: "08:00", heureFin: "09:00", type: "COURS" },
  { heureDebut: "10:30", heureFin: "11:30", type: "COURS" },
];
const days = [1, 2, 3, 4, 5];

// Heures : « 08:00 » devient « 8h00 », durées en minutes.
assert.equal(hourLabel("08:00"), "8h00");
assert.equal(hourLabel("16:30"), "16h30");
assert.equal(rangeLabel("10:30", "11:30"), "10h30-11h30");
assert.equal(minutesOf("13:30", "15:00"), 90);
assert.equal(sheetName("6e:A/B", new Set()), "6e A B");
const used = new Set();
assert.equal(sheetName("6e", used), "6e");
assert.equal(sheetName("6E", used), "6E (2)", "un nom d'onglet est unique sans tenir compte de la casse");

// Grille : une feuille par classe qui a des séances (la 2nde C n'en a aucune : pas de feuille).
const grid = buildGridSheets({ entries, slots, classes, days, yearLabel: "2026/2027", labels });
assert.deepEqual(grid.map((s) => s.sheet), ["6e", "5e"]);
const g6 = grid[0].data;
assert.equal(g6[0].at(-3).value, "6e", "la classe est en quatrième colonne, comme le fichier de l'école");
assert.equal(g6[0].at(-1).value, "2026/2027");
assert.equal(g6[1][0].value, "EMPLOI DU TEMPS");
assert.equal(g6[1][0].columnSpan, 6, "le titre est fusionné sur toute la largeur");
assert.deepEqual(g6[2].map((c) => c.value), ["Jours\nHoraire", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]);
// Créneaux triés par heure : 8h00, 9h00, pause, 10h30, chacun sur deux lignes (matière puis enseignant), la pause sur une.
assert.deepEqual(g6.slice(3).map((r) => r[0]?.value ?? null), ["8h00-9h00", null, "9h00-10h00", null, "10h00-10h30", "10h30-11h30", null]);
assert.equal(g6[3][1].value, "Français");
assert.equal(g6[4][1].value, "MBIDA Maxime");
assert.equal(g6[4][1].textColor, "#c00000", "noms des enseignants en rouge");
assert.equal(g6[4][1].fontWeight, "bold");
assert.equal(g6[4][2].value, null, "case sans séance : vide");
assert.deepEqual(g6[7].slice(1).map((c) => c.value), ["P", "A", "U", "S", "E"], "PAUSE écrit lettre par lettre sur cinq jours");
assert.equal(g6[8][2].value, "Histoire-Géographie");
assert.equal(g6[9][2].value, "CEDRIC P");
// Mot de pause qui n'a pas cinq lettres : cellule fusionnée.
const wide = buildGridSheets({ entries, slots, classes, days, yearLabel: "x", labels: { ...labels, pause: "Récréation" } })[0].data;
assert.equal(wide[7][1].columnSpan, 5);
// Six jours de classe : une colonne de plus partout.
const six = buildGridSheets({ entries, slots, classes, days: [1, 2, 3, 4, 5, 6], yearLabel: "x", labels: { ...labels, days: { ...labels.days, 6: "Samedi" } } })[0];
assert.equal(six.data[1][0].columnSpan, 7);
assert.equal(six.columns.length, 7);
assert.equal(six.data[0].length, 7, "la ligne d'en-tête garde la même largeur que la grille");

// Heures par enseignant.
const hours = computeTeacherHours(entries, [T1, T2, T3]);
assert.deepEqual(hours.map((h) => [h.nom, h.sessions, h.minutes]), [["MBIDA", 3, 180], ["CEDRIC", 2, 150], ["IKENGUISSI", 0, 0]], "trié par heures décroissantes, un enseignant sans séance figure à 0");
assert.deepEqual([...hours[0].byClass], [["6e", 120], ["5e", 60]]);
assert.deepEqual([...hours[1].byDay], [[2, 60], [3, 90]]);
const noList = computeTeacherHours(entries);
assert.equal(noList.length, 2, "sans liste d'enseignants : seulement ceux qui ont des séances");

const sheets = buildHoursSheets({ entries, teachers: [T1, T2, T3], classes, days, labels });
assert.deepEqual(sheets.map((s) => s.sheet), ["Total", "Détail", "Par jour"]);
const total = sheets[0].data;
assert.equal(total[2][0].value, "MBIDA Maxime");
assert.equal(total[2][0].textColor, "#c00000");
assert.equal(total[2][4].value, 3, "3 heures");
assert.equal(total[3][4].value, 2.5, "CEDRIC : 1 h + 1 h 30");
assert.equal(total[4][1].value, "Aucune séance", "enseignant sans séance");
assert.equal(total.at(-1)[0].value, "TOTAL");
assert.equal(total.at(-1)[3].value, 5);
assert.equal(total.at(-1)[4].value, 5.5, "le total est la somme des enseignants");
const detail = sheets[1].data.slice(2);
assert.deepEqual(detail.map((r) => [r[0].value, r[1].value, r[2].value, r[3].value]), [
  ["MBIDA Maxime", "6e", "Français", 2], ["MBIDA Maxime", "5e", "Français", 1],
  ["CEDRIC P", "6e", "Histoire-Géographie", 1], ["CEDRIC P", "5e", "Histoire-Géographie", 1.5],
  ["IKENGUISSI Velda", "-", "Aucune séance", 0],
]);
const perDay = sheets[2].data.slice(2);
assert.deepEqual(perDay[0].slice(1).map((c) => c.value), [3, "-", "-", "-", "-", 3]);

console.log("timetable-excel : tous les contrôles passent");
