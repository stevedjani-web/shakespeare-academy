"use client";

import { api } from "@/lib/api";
import { isOnline } from "@/lib/connectivity";
import { dbGet, dbPut } from "@/lib/offline-db";
import { cachePut } from "@/lib/offline-cache";
import type { AcademicYear, AttendanceDay, Level, Payment, Student, StudentDossier } from "@/lib/types";

// Pages copiées à l'avance par le service worker : sans cela, une page jamais ouverte n'existerait pas
// hors ligne (les pages dynamiques /eleves/<id> et /recus/<id> ne sont pas connues d'avance).
const STATIC_PAGES = [
  "/",
  "/eleves",
  "/eleves/inscription",
  "/eleves-par-classe",
  "/insolvables",
  "/notes",
  "/depenses",
  "/cloture",
  "/appel",
  "/pointage",
  "/emploi-du-temps",
  "/tarifs",
  "/hors-ligne",
  "/audit",
  "/parametres/annees",
  "/parametres/structure",
  "/parametres/etablissement",
  "/parametres/utilisateurs",
  "/login",
];
const MAX_PRECACHED_PAGES = 300;

function precachePages(urls: string[]): void {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: "precache", urls: urls.slice(0, MAX_PRECACHED_PAGES) }))
    .catch(() => {});
}

// "Préparer le mode hors ligne" : parcourt les écrans utiles et en garde une copie (chaque réponse
// réussie de l'API est déjà copiée par `api.get`). Les données d'un élève (dossier, situation
// financière, paiements, facture) sont copiées une par une : c'est ce qui permet d'encaisser sans
// Internet, depuis un dossier que l'on n'a jamais ouvert à la main.

const WARMUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;

export interface WarmupProgress {
  running: boolean;
  done: number;
  total: number;
}

let progress: WarmupProgress = { running: false, done: 0, total: 0 };

export function getWarmupProgress(): WarmupProgress {
  return progress;
}

function setProgress(next: WarmupProgress): void {
  progress = next;
  window.dispatchEvent(new CustomEvent("sa-warmup"));
}

export async function getLastWarmup(): Promise<number | null> {
  return (await dbGet<number>("meta", "lastWarmup")) ?? null;
}

async function inParallel<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch {
        // une ressource indisponible n'empêche pas de copier les autres
      }
      setProgress({ ...progress, done: progress.done + 1 });
    }
  });
  await Promise.all(lanes);
}

export async function warmOfflineCache(options: { force?: boolean; permissions?: string[] } = {}): Promise<void> {
  if (progress.running || !isOnline()) return;
  if (!options.force) {
    const last = await getLastWarmup();
    if (last && Date.now() - last < WARMUP_INTERVAL_MS) return;
  }
  const can = (code: string) => options.permissions?.includes(code) ?? true;

  // L'appel du jour se fait sans Internet : on garde les séances d'aujourd'hui et leurs feuilles d'appel
  // (celles de l'école entière pour la vie scolaire, les siennes seulement pour un enseignant : le serveur
  // applique la portée).
  // Notes : l'enseignant saisit sans Internet. On garde ses évaluations et leurs feuilles (chemins exacts, l'écran lit
  // le cache par chemin). Le serveur applique la portée : seules ses matières sont renvoyées.
  const warmGrades = async (): Promise<void> => {
    try {
      const context = await api.get<{
        trimestres: Array<{ id: string }>;
        affectations: Array<{ classId: string; subjectId: string }>;
      }>("/grades/context");
      const paths = context.trimestres.flatMap((t) =>
        context.affectations.map((a) => `/grades/evaluations?termId=${t.id}&classId=${a.classId}&subjectId=${a.subjectId}`),
      );
      setProgress({ ...progress, total: progress.total + paths.length });
      const evaluations: string[] = [];
      await inParallel(paths, async (path) => {
        const rows = await api.get<Array<{ id: string; periode: string }>>(path);
        for (const r of rows) if (r.periode === "OUVERT") evaluations.push(r.id);
      });
      await inParallel(evaluations, async (id) => {
        await api.get(`/grades/evaluations/${id}/sheet`);
      });
    } catch {
      // la saisie reste possible avec ce qui a déjà été copié
    }
  };

  const warmAttendance = async (): Promise<void> => {
    try {
      const day = await api.get<AttendanceDay>(`/attendance/day?date=${new Date().toISOString().slice(0, 10)}`);
      const today = await api.get<AttendanceDay>(`/attendance/day?date=${day.aujourdhui}`);
      setProgress({ ...progress, total: progress.total + today.seances.length });
      await inParallel(today.seances, async (s) => {
        await api.get(`/attendance/sheet?entryId=${s.entryId}&date=${today.date}`);
      });
    } catch {
      // l'appel reste possible avec ce qui a déjà été copié
    }
  };

  setProgress({ running: true, done: 0, total: 1 });
  try {
    // Un compte d'enseignant n'a accès qu'à son pointage : rien de la liste des élèves ni des finances.
    if (can("TEACHER_CHECKIN_SELF")) {
      await api.get("/teacher-checkins/me").catch(() => {});
      precachePages(["/pointage", "/login", "/"]);
    }
    if (!can("STUDENT_READ")) {
      if (can("ATTENDANCE_TAKE")) {
        await warmAttendance();
        precachePages(["/appel"]);
      }
      if (can("GRADE_ENTER")) {
        await warmGrades();
        precachePages(["/notes"]);
      }
      await dbPut("meta", "lastWarmup", Date.now());
      return;
    }

    const [years, students] = await Promise.all([
      api.get<AcademicYear[]>("/academic-years"),
      api.get<Student[]>("/students"),
      api.get("/school"),
      api.get("/sections"),
      api.get("/cycles"),
    ]);
    const levels = await api.get<Level[]>("/levels");
    const activeYear = years.find((y) => y.statut === "ACTIVE");

    // Les finances (tableau de bord, insolvables, statuts, reçus) ne sont copiées que pour un compte qui a
    // le droit de les lire : sans FINANCE_READ le serveur les refuserait de toute façon.
    const finance = can("FINANCE_READ");
    const shared: string[] = [
      ...(finance ? ["/reports/dashboard", "/reports/insolvent-students"] : []),
      "/reports/students-by-class",
      "/fee-types",
      ...(can("CASH_CLOSE") ? ["/expenses", `/reports/cash-closing?date=${new Date().toISOString().slice(0, 10)}`] : []),
      ...(activeYear ? levels.map((l) => `/classes?levelId=${l.id}&academicYearId=${activeYear.id}`) : []),
    ];
    const totalWork = shared.length + students.length;
    setProgress({ running: true, done: 0, total: totalWork });

    await inParallel(shared, async (path) => {
      await api.get(path);
    });

    const receiptIds: string[] = [];
    await inParallel(students, async (student) => {
      const dossier = await api.get<StudentDossier>(`/students/${student.id}`);
      const active = dossier.enrollments.find((e) => e.statut === "ACTIVE");
      if (!finance) return;
      const [, payments] = await Promise.all([
        api.get(`/students/${student.id}/financial-status`),
        api.get<Payment[]>(`/payments?studentId=${student.id}`),
        active ? api.get(`/invoices/by-enrollment/${active.id}`) : Promise.resolve(),
      ]);
      // La page d'un reçu relit `/payments/:id` : on en garde une copie à partir de la liste déjà reçue.
      for (const p of payments) {
        await cachePut(`/payments/${p.id}`, p);
        receiptIds.push(p.id);
      }
    });

    if (can("ATTENDANCE_READ") || can("ATTENDANCE_TAKE")) {
      await warmAttendance();
    }
    if (can("GRADE_ENTER")) {
      await warmGrades();
    }

    precachePages([...STATIC_PAGES, ...students.map((s) => `/eleves/${s.id}`), ...receiptIds.map((id) => `/recus/${id}`)]);

    await dbPut("meta", "lastWarmup", Date.now());
  } finally {
    setProgress({ ...progress, running: false });
  }
}
