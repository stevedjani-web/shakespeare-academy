"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { translate, type MessageKey } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

interface Counters {
  total: number;
  presents: number;
  retards: number;
  absents: number;
  justifiees: number;
  nonJustifiees: number;
  enAttente: number;
  delaiEnCours: number;
  tauxPresence: number | null;
  tauxAbsence: number | null;
  tauxRetard: number | null;
}

interface Dashboard {
  periode: { from: string; to: string; days: number; aujourdhui: string; classId: string | null };
  parametres: { retardMaxMinutes: number; delaiJustificatifJours: number; toleranceRetardEnseignantMinutes: number; seuilAlerteAbsences: number | null };
  assiduite: {
    totaux: Counters & { appelsEffectues: number };
    parClasse: Array<Counters & { classId: string; classe: string }>;
    parJour: Array<Counters & { date: string }>;
    appels: {
      prevues: number;
      effectuees: number;
      manquants: number;
      tauxCouverture: number | null;
      dernieres: Array<{ date: string; classe: string; matiere: string; heureDebut: string; enseignant: string }>;
    };
  };
  enseignants: {
    toleranceRetardMinutes: number;
    totaux: {
      pointagesPrevus: number;
      pointagesTenus: number;
      nonPointes: number;
      enAttenteDeValidation: number;
      retards: number;
      minutesRetard: number;
      heuresEffectuees: number;
      seancesConfieesARemplacant: number;
      tauxPresence: number | null;
      tauxPonctualite: number | null;
    };
    lignes: Array<{
      teacherId: string;
      enseignant: string;
      unite: string;
      prevues: number;
      tenues: number;
      enAttente: number;
      nonPointees: number;
      retards: number;
      minutesRetard: number;
      tauxPresence: number | null;
      tauxPonctualite: number | null;
    }>;
  };
  alertes: {
    actives: boolean;
    seuil: number | null;
    eleves: Array<{
      studentId: string;
      eleve: string;
      matricule: string;
      classe: string | null;
      nonJustifiees: number;
      enAttente: number;
      delaiEnCours: number;
      retards: number;
      derniereAbsence: string | null;
    }>;
  };
}

interface ClassItem {
  id: string;
  nom: string;
}

const TZ = "Africa/Brazzaville";
const isoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** Nombre décimal dans la langue courante (virgule en français, point en anglais). */
const fmtNum = (v: number) => (getLocale() === "fr" ? String(v).replace(".", ",") : String(v));
/** « 12,5 % » en français, « 12.5% » en anglais ; « — » quand il n'y a rien à comparer. */
const fmtPct = (v: number | null) => (v === null ? "—" : getLocale() === "fr" ? `${fmtNum(v)} %` : `${fmtNum(v)}%`);

// Singulier et pluriel de chaque mot compté (clés de dictionnaire, jamais du texte figé au chargement).
const COUNT_KEYS: Record<"absence" | "late" | "notChecked" | "day", { one: MessageKey; many: MessageKey }> = {
  absence: { one: "acd.pil.absenceOne", many: "acd.pil.absenceMany" },
  late: { one: "acd.pil.lateOne", many: "acd.pil.lateMany" },
  notChecked: { one: "acd.pil.notCheckedOne", many: "acd.pil.notCheckedMany" },
  day: { one: "acd.pil.dayOne", many: "acd.pil.dayMany" },
};
const plural = (n: number, word: keyof typeof COUNT_KEYS) => translate(n > 1 ? COUNT_KEYS[word].many : COUNT_KEYS[word].one, { n });

// Les quatre exports CSV : le type est celui du serveur, le libellé et le nom de fichier sont propres à la langue.
const EXPORTS: Array<{ kind: string; label: MessageKey; file: MessageKey }> = [
  { kind: "assiduite-classes", label: "acd.pil.exp.classes", file: "acd.pil.exp.fileClasses" },
  { kind: "assiduite-jours", label: "acd.pil.exp.days", file: "acd.pil.exp.fileDays" },
  { kind: "enseignants", label: "acd.pil.exp.teachers", file: "acd.pil.exp.fileTeachers" },
  { kind: "alertes", label: "acd.pil.exp.alerts", file: "acd.pil.exp.fileAlerts" },
];

/** L'unité d'un enseignant vient du serveur (« jours » ou « séances ») : on la traduit, sans rien inventer pour une autre valeur. */
function unitLabel(unite: string): string {
  if (unite === "jours") return translate("acd.pil.unitDays");
  if (unite === "séances") return translate("acd.pil.unitSessions");
  return unite;
}

// Pilotage 360° (Lot 14) : tableau de bord de la Direction. Rien n'est saisi ni stocké : chaque chiffre est recalculé
// à l'affichage depuis les appels, les justificatifs, les pointages et l'emploi du temps.
export default function PilotagePage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const allowed = hasPermission("PILOTAGE_READ");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f?: string, end?: string, c?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set("from", f);
      if (end) qs.set("to", end);
      if (c) qs.set("classId", c);
      const res = await api.get<Dashboard>(`/pilotage/dashboard${qs.toString() ? `?${qs}` : ""}`);
      setData(res);
      setFrom(res.periode.from);
      setTo(res.periode.to);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
    void api
      .get<ClassItem[]>("/classes")
      .then(setClasses)
      .catch(() => undefined);
  }, [allowed, load]);

  async function download(kind: string, slug: string) {
    if (!data) return;
    try {
      const qs = new URLSearchParams({ from: data.periode.from, to: data.periode.to });
      if (classId) qs.set("classId", classId);
      await api.download(`/pilotage/export/${kind}?${qs}`, t("acd.pil.exp.fileName", { slug, from: data.periode.from, to: data.periode.to }));
    } catch (err) {
      setError(describeError(err));
    }
  }

  function preset(days: number) {
    const end = isoToday();
    void load(addDays(end, -(days - 1)), end, classId);
  }

  if (!allowed) {
    return (
      <div>
        <PageTitle eyebrow={t("acd.pil.eyebrow")}>{t("acd.pil.titleShort")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("acd.pil.noPermission")}</p>
      </div>
    );
  }

  const a = data?.assiduite;
  const te = data?.enseignants;

  return (
    <div>
      <PageTitle eyebrow={t("acd.pil.eyebrow")} subtitle={t("acd.pil.subtitle")} helpId="pilotage">
        {t("acd.pil.title")}
      </PageTitle>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={t("acd.pil.from")}>
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("acd.pil.to")}>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t("acd.pil.class")}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("acd.pil.allClasses")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void load(from, to, classId)} disabled={loading || !from || !to} className="w-full">
              <RefreshCw size={16} /> {t("acd.pil.refresh")}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => void load(undefined, undefined, classId)}>
            {t("acd.pil.thisMonth")}
          </button>
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => preset(7)}>
            {t("acd.pil.last7")}
          </button>
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => preset(30)}>
            {t("acd.pil.last30")}
          </button>
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => preset(90)}>
            {t("acd.pil.last90")}
          </button>
        </div>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("acd.pil.computing")}
        </p>
      )}

      {data && a && te && (
        <div className={loading ? "opacity-60" : ""}>
          {/* Indicateurs clés */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t("acd.pil.kpiPresence")}
              value={fmtPct(a.totaux.tauxPresence)}
              hint={t("acd.pil.kpiPresenceHint", { total: a.totaux.total, absences: plural(a.totaux.absents, "absence"), lates: plural(a.totaux.retards, "late") })}
            />
            <Kpi
              label={t("acd.pil.kpiUnexcused")}
              value={String(a.totaux.nonJustifiees)}
              hint={t("acd.pil.kpiUnexcusedHint", { pending: a.totaux.enAttente, inDeadline: a.totaux.delaiEnCours })}
              tone={a.totaux.nonJustifiees > 0 ? "warn" : "ok"}
            />
            <Kpi
              label={t("acd.pil.kpiRegisters")}
              value={fmtPct(a.appels.tauxCouverture)}
              hint={t("acd.pil.kpiRegistersHint", { done: a.appels.effectuees, planned: a.appels.prevues, missing: a.appels.manquants })}
              tone={a.appels.manquants > 0 ? "warn" : "ok"}
            />
            <Kpi
              label={t("acd.pil.kpiPunctuality")}
              value={fmtPct(te.totaux.tauxPonctualite)}
              hint={t("acd.pil.kpiPunctualityHint", {
                lates: plural(te.totaux.retards, "late"),
                notChecked: plural(te.totaux.nonPointes, "notChecked"),
                hours: fmtNum(te.totaux.heuresEffectuees),
              })}
            />
          </div>

          {/* Alertes */}
          <Card className="mb-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <AlertTriangle size={18} className="text-warning" /> {t("acd.pil.alertsTitle")}
              </h2>
              {data.alertes.actives && (
                <Badge color={data.alertes.eleves.length > 0 ? "orange" : "green"}>{t("acd.pil.alertsFlagged", { n: data.alertes.eleves.length })}</Badge>
              )}
            </div>
            {!data.alertes.actives ? (
              <p className="text-sm text-ink-muted">
                {t("acd.pil.alertsOffBefore")}{" "}
                <Link href="/vie-scolaire" className="font-medium text-primary underline">
                  {t("acd.pil.alertsOffLink")}
                </Link>
                .
              </p>
            ) : data.alertes.eleves.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("acd.pil.alertsNone", { threshold: data.alertes.seuil ?? "" })}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3">{t("acd.pil.thStudent")}</th>
                      <th className="py-2 pr-3">{t("acd.pil.thClass")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thUnexcused")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thPending")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thInDeadline")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thLates")}</th>
                      <th className="py-2">{t("acd.pil.thLastAbsence")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alertes.eleves.map((e) => (
                      <tr key={e.studentId} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium text-ink">
                          {e.eleve} <span className="text-xs font-normal text-ink-muted">{e.matricule}</span>
                        </td>
                        <td className="py-2 pr-3">{e.classe ?? "—"}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-danger">{e.nonJustifiees}</td>
                        <td className="py-2 pr-3 text-right">{e.enAttente}</td>
                        <td className="py-2 pr-3 text-right">{e.delaiEnCours}</td>
                        <td className="py-2 pr-3 text-right">{e.retards}</td>
                        <td className="py-2">{e.derniereAbsence ? fmtDay(e.derniereAbsence) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Assiduité par classe et par jour */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">{t("acd.pil.byClassTitle")}</h2>
              {a.parClasse.length === 0 ? (
                <EmptyState title={t("acd.pil.noRegister")} />
              ) : (
                <ul className="space-y-3">
                  {a.parClasse.map((c) => (
                    <li key={c.classId}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{c.classe}</span>
                        <span className="text-ink-muted">
                          {t("acd.pil.byClassLine", { abs: fmtPct(c.tauxAbsence), late: fmtPct(c.tauxRetard), n: c.nonJustifiees })}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={t("acd.pil.absenceRateAria", { rate: fmtPct(c.tauxAbsence) })}>
                        <div className="h-full rounded-full bg-danger" style={{ width: `${Math.min(100, c.tauxAbsence ?? 0)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">{t("acd.pil.byDayTitle")}</h2>
              {a.parJour.length === 0 ? (
                <EmptyState title={t("acd.pil.noRegister")} />
              ) : (
                <div className="flex h-40 items-end gap-1 overflow-x-auto pb-1">
                  {a.parJour.map((j) => (
                    <div
                      key={j.date}
                      className="flex min-w-6 flex-1 flex-col items-center justify-end gap-1"
                      title={t("acd.pil.byDayTip", { day: fmtDay(j.date), rate: fmtPct(j.tauxAbsence), absents: j.absents, total: j.total })}
                    >
                      <div className="w-full rounded-t bg-danger/80" style={{ height: `${Math.max(2, Math.min(100, j.tauxAbsence ?? 0))}%` }} />
                      <span className="text-[10px] text-ink-muted">{fmtDay(j.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Appels manquants */}
          <Card className="mb-4">
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">{t("acd.pil.missingTitle")}</h2>
            <p className="mb-2 text-xs text-ink-muted">{t("acd.pil.missingDesc")}</p>
            {a.appels.dernieres.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("acd.pil.missingNone")}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {a.appels.dernieres.map((m, i) => (
                  <li key={`${m.date}-${m.classe}-${m.heureDebut}-${i}`} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium text-ink">
                      {fmtDay(m.date)} {m.heureDebut} · {m.classe}
                    </span>
                    <span className="text-ink-muted">
                      {m.matiere}, {m.enseignant}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Enseignants */}
          <Card className="mb-4">
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">{t("acd.pil.teachersTitle")}</h2>
            <p className="mb-2 text-xs text-ink-muted">
              {t("acd.pil.teachersDesc1", { n: te.toleranceRetardMinutes })} {t("acd.pil.teachersDesc2")}
            </p>
            {te.lignes.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("acd.pil.teachersNone")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3">{t("acd.pil.thTeacher")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thPlanned")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thHeld")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thNotChecked")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thToValidate")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thLates")}</th>
                      <th className="py-2 pr-3 text-right">{t("acd.pil.thPresence")}</th>
                      <th className="py-2 text-right">{t("acd.pil.thPunctuality")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {te.lignes.map((l) => (
                      <tr key={l.teacherId} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium text-ink">
                          {l.enseignant} <span className="text-xs font-normal text-ink-muted">({unitLabel(l.unite)})</span>
                        </td>
                        <td className="py-2 pr-3 text-right">{l.prevues}</td>
                        <td className="py-2 pr-3 text-right">{l.tenues}</td>
                        <td className="py-2 pr-3 text-right">{l.nonPointees}</td>
                        <td className="py-2 pr-3 text-right">{l.enAttente}</td>
                        <td className="py-2 pr-3 text-right">{l.retards}</td>
                        <td className="py-2 pr-3 text-right">{fmtPct(l.tauxPresence)}</td>
                        <td className="py-2 text-right font-medium">{fmtPct(l.tauxPonctualite)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Exports */}
          <Card>
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">{t("acd.pil.exportTitle")}</h2>
            <p className="mb-3 text-xs text-ink-muted">{t("acd.pil.exportDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((e) => (
                <Button key={e.kind} variant="secondary" onClick={() => void download(e.kind, t(e.file))} disabled={e.kind === "alertes" && !data.alertes.actives}>
                  <Download size={16} /> {t(e.label)}
                </Button>
              ))}
            </div>
          </Card>

          <p className="mt-4 text-xs text-ink-muted">
            {t("acd.pil.footer", {
              from: fmtDay(data.periode.from),
              to: fmtDay(data.periode.to),
              days: plural(data.periode.days, "day"),
              late: data.parametres.retardMaxMinutes,
              delay: data.parametres.delaiJustificatifJours,
            })}
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${tone === "warn" ? "border-warning/40" : "border-border"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
