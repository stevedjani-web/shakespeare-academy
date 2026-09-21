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
  "/depenses",
  "/cloture",
  "/appel",
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

  setProgress({ running: true, done: 0, total: 1 });
  try {
    const [years, students] = await Promise.all([
      api.get<AcademicYear[]>("/academic-years"),
      api.get<Student[]>("/students"),
      api.get("/school"),
      api.get("/sections"),
      api.get("/cycles"),
    ]);
    const levels = await api.get<Level[]>("/levels");
    const activeYear = years.find((y) => y.statut === "ACTIVE");

    const shared: string[] = [
      "/reports/dashboard",
      "/reports/students-by-class",
      "/reports/insolvent-students",
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

    // L'appel du jour se fait sans Internet : on garde les séances d'aujourd'hui et leurs feuilles d'appel.
    if (can("ATTENDANCE_READ")) {
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
    }

    precachePages([...STATIC_PAGES, ...students.map((s) => `/eleves/${s.id}`), ...receiptIds.map((id) => `/recus/${id}`)]);

    await dbPut("meta", "lastWarmup", Date.now());
  } finally {
    setProgress({ ...progress, running: false });
  }
}
