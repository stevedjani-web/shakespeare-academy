// Exports Excel de l'emploi du temps : la grille par classe (un onglet par classe, mise en page du fichier de l'école :
// une ligne pour la matière, une ligne dessous pour l'enseignant) et les heures hebdomadaires par enseignant.
// Les constructeurs sont purs (aucun accès au navigateur ni aux traductions : les libellés arrivent tout prêts), pour
// pouvoir être contrôlés par `scripts/check-timetable-excel.mjs` ; seule l'écriture du fichier touche au navigateur.

export interface XlEntry {
  classId: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  class: { nom: string };
  subject: { nom: string };
  teacher: { id: string; nom: string; prenom: string };
}

export interface XlSlot {
  heureDebut: string;
  heureFin: string;
  type: "COURS" | "PAUSE";
}

export interface XlClass {
  id: string;
  nom: string;
}

export interface XlTeacher {
  id: string;
  nom: string;
  prenom: string;
}

export interface XlLabels {
  classLabel: string;
  yearLabel: string;
  title: string;
  daysHeader: string;
  /** Mot de la pause, écrit lettre par lettre sur les cinq jours quand il a cinq lettres (« PAUSE »), sinon fusionné. */
  pause: string;
  days: Record<number, string>;
  hoursTitle: string;
  colTeacher: string;
  colSubjects: string;
  colClasses: string;
  colSessions: string;
  colHours: string;
  colClass: string;
  colSubject: string;
  total: string;
  noSession: string;
  sheetTotal: string;
  sheetDetail: string;
  sheetDay: string;
  detailTitle: string;
  dayTitle: string;
}

export interface XlSheet {
  sheet: string;
  data: Array<Array<Record<string, unknown> | null>>;
  columns: Array<{ width: number }>;
}

const PRIMARY = "#2a2361";
const SOFT = "#efeaf7";
const NAME_RED = "#c00000"; // noms des enseignants : rouge foncé et gras, lisibles à l'écran comme imprimés
const TOTAL_FILL = "#faf1dc";

const cell = (value: string | null, extra: Record<string, unknown> = {}) => ({
  value,
  type: String,
  align: "center",
  alignVertical: "center",
  wrap: true,
  ...extra,
});
const text = (value: string | null, extra: Record<string, unknown> = {}) => ({ value, type: String, alignVertical: "center", wrap: true, ...extra });
const num = (value: number, extra: Record<string, unknown> = {}) => ({ value, type: Number, format: "0.0", align: "center", alignVertical: "center", ...extra });
const int = (value: number, extra: Record<string, unknown> = {}) => ({ value, type: Number, format: "0", align: "center", alignVertical: "center", ...extra });
const head = (value: string) => ({ value, type: String, fontWeight: "bold", textColor: "#ffffff", backgroundColor: PRIMARY, align: "center", alignVertical: "center", wrap: true });
const title = (value: string, span: number) => [{ value, type: String, fontWeight: "bold", fontSize: 14, textColor: PRIMARY, columnSpan: span }, ...Array<null>(span - 1).fill(null)];

/** « 08:00 » devient « 8h00 » ; « 08:00 » et « 8:00 » donnent la même heure. */
export function hourLabel(time: string): string {
  const [h, m] = time.split(":");
  return `${Number(h)}h${m}`;
}

export function rangeLabel(start: string, end: string): string {
  return `${hourLabel(start)}-${hourLabel(end)}`;
}

export function minutesOf(start: string, end: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(end) - toMin(start);
}

export const personName = (t: { nom: string; prenom: string }) => `${t.nom} ${t.prenom}`;

/** Nom d'onglet Excel : 31 caractères au plus, sans [ ] : * ? / \, unique. */
export function sheetName(base: string, used: Set<string>): string {
  const clean = base.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Feuille";
  let name = clean;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${clean} (${n})`;
  used.add(name.toLowerCase());
  return name;
}

/** Une feuille par classe qui a au moins une séance, dans l'ordre donné. */
export function buildGridSheets(input: {
  entries: XlEntry[];
  slots: XlSlot[];
  classes: XlClass[];
  days: number[];
  yearLabel: string;
  labels: XlLabels;
}): XlSheet[] {
  const { entries, classes, days, yearLabel, labels } = input;
  const slots = [...input.slots].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const width = days.length + 1;
  const used = new Set<string>();
  const sheets: XlSheet[] = [];

  for (const klass of classes) {
    const own = entries.filter((e) => e.classId === klass.id);
    if (own.length === 0) continue;
    const at = (day: number, start: string) => own.find((e) => e.jourSemaine === day && e.heureDebut === start);

    const rows: XlSheet["data"] = [];
    rows.push([
      null,
      ...Array<null>(Math.max(0, width - 5)).fill(null),
      cell(labels.classLabel, { fontWeight: "bold", align: "right" }),
      cell(klass.nom, { fontWeight: "bold" }),
      cell(labels.yearLabel, { fontWeight: "bold", align: "right" }),
      cell(yearLabel, { fontWeight: "bold" }),
    ]);
    rows.push([cell(labels.title, { fontWeight: "bold", fontSize: 14, textColor: "#ffffff", backgroundColor: PRIMARY, columnSpan: width }), ...Array<null>(width - 1).fill(null)]);
    rows.push([cell(labels.daysHeader, { fontWeight: "bold", backgroundColor: SOFT }), ...days.map((d) => cell(labels.days[d] ?? String(d), { fontWeight: "bold", backgroundColor: SOFT }))]);

    for (const slot of slots) {
      const label = rangeLabel(slot.heureDebut, slot.heureFin);
      if (slot.type === "PAUSE") {
        const letters = [...labels.pause];
        const cells =
          letters.length === days.length
            ? letters.map((l) => cell(l, { backgroundColor: SOFT, fontWeight: "bold" }))
            : [cell(labels.pause, { backgroundColor: SOFT, fontWeight: "bold", columnSpan: days.length }), ...Array<null>(days.length - 1).fill(null)];
        rows.push([cell(label, { fontWeight: "bold" }), ...cells]);
        continue;
      }
      rows.push([cell(label, { fontWeight: "bold" }), ...days.map((d) => cell(at(d, slot.heureDebut)?.subject.nom ?? null, { fontWeight: "bold", textColor: "#1c1c2e" }))]);
      rows.push([null, ...days.map((d) => {
        const e = at(d, slot.heureDebut);
        return cell(e ? personName(e.teacher) : null, { fontWeight: "bold", textColor: NAME_RED });
      })]);
    }
    sheets.push({ sheet: sheetName(klass.nom, used), data: rows, columns: [{ width: 16 }, ...days.map(() => ({ width: 30 }))] });
  }
  return sheets;
}

export interface TeacherHours {
  teacherId: string;
  nom: string;
  prenom: string;
  sessions: number;
  minutes: number;
  byClass: Map<string, number>;
  bySubject: Map<string, number>;
  byDay: Map<number, number>;
  combos: Map<string, { classe: string; matiere: string; minutes: number }>;
}

/** Heures par semaine de chaque enseignant, d'après les séances de la version ; ceux sans séance figurent à 0. */
export function computeTeacherHours(entries: XlEntry[], teachers: XlTeacher[] = []): TeacherHours[] {
  const map = new Map<string, TeacherHours>();
  const ensure = (t: XlTeacher) => {
    let row = map.get(t.id);
    if (!row) {
      row = { teacherId: t.id, nom: t.nom, prenom: t.prenom, sessions: 0, minutes: 0, byClass: new Map(), bySubject: new Map(), byDay: new Map(), combos: new Map() };
      map.set(t.id, row);
    }
    return row;
  };
  for (const t of teachers) ensure(t);
  for (const e of entries) {
    const row = ensure(e.teacher);
    const minutes = minutesOf(e.heureDebut, e.heureFin);
    row.sessions += 1;
    row.minutes += minutes;
    row.byClass.set(e.class.nom, (row.byClass.get(e.class.nom) ?? 0) + minutes);
    row.bySubject.set(e.subject.nom, (row.bySubject.get(e.subject.nom) ?? 0) + minutes);
    row.byDay.set(e.jourSemaine, (row.byDay.get(e.jourSemaine) ?? 0) + minutes);
    const key = `${e.class.nom}|${e.subject.nom}`;
    const combo = row.combos.get(key) ?? { classe: e.class.nom, matiere: e.subject.nom, minutes: 0 };
    combo.minutes += minutes;
    row.combos.set(key, combo);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
}

/** Trois feuilles : total par enseignant, détail par classe et matière, répartition par jour. */
export function buildHoursSheets(input: {
  entries: XlEntry[];
  teachers?: XlTeacher[];
  classes: XlClass[];
  days: number[];
  labels: XlLabels;
}): XlSheet[] {
  const { labels, days } = input;
  const list = computeTeacherHours(input.entries, input.teachers);
  const classOrder = input.classes.map((c) => c.nom);
  const orderOf = (name: string) => {
    const i = classOrder.indexOf(name);
    return i < 0 ? classOrder.length : i;
  };
  const hours = (minutes: number) => minutes / 60;
  const name = (t: TeacherHours) => text(personName(t), { fontWeight: "bold", textColor: NAME_RED });
  const stripe = (i: number) => (i % 2 === 1 ? { backgroundColor: SOFT } : {});

  const total = list.reduce((n, t) => ({ sessions: n.sessions + t.sessions, minutes: n.minutes + t.minutes }), { sessions: 0, minutes: 0 });
  const rows1: XlSheet["data"] = [
    title(labels.hoursTitle, 5),
    [head(labels.colTeacher), head(labels.colSubjects), head(labels.colClasses), head(labels.colSessions), head(labels.colHours)],
  ];
  list.forEach((t, i) => {
    rows1.push([
      { ...name(t), ...stripe(i) },
      text([...t.bySubject.keys()].sort().join(", ") || labels.noSession, stripe(i)),
      text([...t.byClass.keys()].sort((a, b) => orderOf(a) - orderOf(b)).join(", "), stripe(i)),
      int(t.sessions, stripe(i)),
      num(hours(t.minutes), { fontWeight: "bold", ...stripe(i) }),
    ]);
  });
  rows1.push([text(labels.total, { fontWeight: "bold", backgroundColor: TOTAL_FILL }), text(null, { backgroundColor: TOTAL_FILL }), text(null, { backgroundColor: TOTAL_FILL }), int(total.sessions, { fontWeight: "bold", backgroundColor: TOTAL_FILL }), num(hours(total.minutes), { fontWeight: "bold", backgroundColor: TOTAL_FILL })]);

  const rows2: XlSheet["data"] = [title(labels.detailTitle, 4), [head(labels.colTeacher), head(labels.colClass), head(labels.colSubject), head(labels.colHours)]];
  for (const t of list) {
    const combos = [...t.combos.values()].sort((a, b) => orderOf(a.classe) - orderOf(b.classe) || a.matiere.localeCompare(b.matiere));
    if (combos.length === 0) rows2.push([name(t), text("-"), text(labels.noSession), num(0)]);
    for (const c of combos) rows2.push([name(t), text(c.classe), text(c.matiere), num(hours(c.minutes))]);
  }

  const rows3: XlSheet["data"] = [title(labels.dayTitle, days.length + 2), [head(labels.colTeacher), ...days.map((d) => head(labels.days[d] ?? String(d))), head(labels.total)]];
  for (const t of list) {
    rows3.push([name(t), ...days.map((d) => (t.byDay.get(d) ? num(hours(t.byDay.get(d) as number)) : text("-", { align: "center", textColor: "#9a9aaa" }))), num(hours(t.minutes), { fontWeight: "bold" })]);
  }

  return [
    { sheet: labels.sheetTotal, data: rows1, columns: [{ width: 30 }, { width: 44 }, { width: 22 }, { width: 20 }, { width: 20 }] },
    { sheet: labels.sheetDetail, data: rows2, columns: [{ width: 30 }, { width: 12 }, { width: 38 }, { width: 20 }] },
    { sheet: labels.sheetDay, data: rows3, columns: [{ width: 30 }, ...days.map(() => ({ width: 12 })), { width: 12 }] },
  ];
}

function safeFile(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Écrit le classeur dans le navigateur (téléchargement). */
export async function downloadWorkbook(fileName: string, sheets: XlSheet[]): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const stamp = new Date().toISOString().slice(0, 10);
  // Les types de cellule de la bibliothèque sont stricts ; les objets ci-dessus respectent son contrat.
  await writeExcelFile(sheets as never).toFile(`${safeFile(fileName)}-${stamp}.xlsx`);
}
