// Activité des parents dans leur espace : types renvoyés par `GET /parent-activity` et règles d'affichage (fonctions pures).

export interface ActivityChild {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: string | null;
}

export interface ActivityParent {
  accountId: string;
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  statut: "ACTIF" | "INACTIF";
  activeLe: string;
  dernierLoginAt: string | null;
  connexions: number;
  enfants: ActivityChild[];
}

export interface ActivitySummary {
  comptes: number;
  actifs: number;
  jamaisConnectes: number;
  connectes24h: number;
  connectes7j: number;
  connectes30j: number;
  connectesPeriode: number;
  inactifsPeriode: number;
  connexionsPeriode: number;
}

export interface ActivityOverview {
  jours: number;
  resume: ActivitySummary;
  parents: ActivityParent[];
}

export interface LoginEvent {
  id: string;
  le: string;
  accountId: string | null;
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  enfants: ActivityChild[];
}

export interface LoginHistory {
  jours: number;
  total: number;
  affiches: number;
  evenements: LoginEvent[];
}

export type ActivityState = "never" | "connected" | "away" | "disabled";
export type ActivityStateFilter = "all" | ActivityState;

/** État d'un compte : désactivé, jamais connecté, connecté sur la période, ou déjà venu mais pas revenu sur la période. */
export function activityState(p: Pick<ActivityParent, "statut" | "dernierLoginAt" | "connexions">): ActivityState {
  if (p.statut !== "ACTIF") return "disabled";
  if (!p.dernierLoginAt) return "never";
  return p.connexions > 0 ? "connected" : "away";
}

const norm = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

export function parentName(p: { nom: string | null; prenom: string | null }): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim();
}

/** Recherche sur le nom du parent, son téléphone (chiffres seuls) ou le nom de ses enfants. */
export function matchesQuery(p: Pick<ActivityParent, "nom" | "prenom" | "telephone" | "enfants">, query: string): boolean {
  const q = norm(query).trim();
  if (!q) return true;
  const qd = digits(query);
  if (qd.length >= 3 && digits(p.telephone).includes(qd)) return true;
  const haystack = [p.nom, p.prenom, ...p.enfants.flatMap((c) => [c.nom, c.prenom, c.matricule])].map(norm).join(" ");
  return haystack.includes(q);
}

export function filterParents(
  rows: ActivityParent[],
  opts: { query: string; state: ActivityStateFilter; classe: string },
): ActivityParent[] {
  return rows.filter(
    (p) =>
      (opts.state === "all" || activityState(p) === opts.state) &&
      (!opts.classe || p.enfants.some((c) => c.classe === opts.classe)) &&
      matchesQuery(p, opts.query),
  );
}

/** Classes présentes, dans l'ordre alphabétique, pour le filtre. */
export function classesOf(rows: ActivityParent[]): string[] {
  const set = new Set<string>();
  for (const p of rows) for (const c of p.enfants) if (c.classe) set.add(c.classe);
  return [...set].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

/** « il y a 3 jours », « hier », « il y a 2 h » : lisible d'un coup d'œil, la date exacte reste affichée à côté. */
export function relativeTime(iso: string, now: Date, locale: string): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 60) return rtf.format(Math.round(seconds / 86400), "day");
  return rtf.format(Math.round(seconds / (86400 * 30)), "month");
}
