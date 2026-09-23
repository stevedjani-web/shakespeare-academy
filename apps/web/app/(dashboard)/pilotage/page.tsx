"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
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
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const fmtPct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);

const EXPORTS: Array<{ kind: string; label: string }> = [
  { kind: "assiduite-classes", label: "Assiduité par classe" },
  { kind: "assiduite-jours", label: "Assiduité par jour" },
  { kind: "enseignants", label: "Enseignants" },
  { kind: "alertes", label: "Alertes de décrochage" },
];

// Pilotage 360° (Lot 14) : tableau de bord de la Direction. Rien n'est saisi ni stocké : chaque chiffre est recalculé
// à l'affichage depuis les appels, les justificatifs, les pointages et l'emploi du temps.
export default function PilotagePage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission("PILOTAGE_READ");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f?: string, t?: string, c?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set("from", f);
      if (t) qs.set("to", t);
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

  async function download(kind: string) {
    if (!data) return;
    try {
      const qs = new URLSearchParams({ from: data.periode.from, to: data.periode.to });
      if (classId) qs.set("classId", classId);
      await api.download(`/pilotage/export/${kind}?${qs}`, `pilotage-${kind}-${data.periode.from}-${data.periode.to}.csv`);
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
        <PageTitle eyebrow="Direction">Pilotage</PageTitle>
        <p className="text-sm text-ink-muted">Le tableau de bord de pilotage est réservé à la Direction.</p>
      </div>
    );
  }

  const a = data?.assiduite;
  const t = data?.enseignants;

  return (
    <div>
      <PageTitle
        eyebrow="Direction"
        subtitle="Assiduité des élèves, ponctualité des enseignants et alertes de décrochage. Chaque chiffre est recalculé depuis les appels, les justificatifs et les pointages : rien n'est saisi."
        helpId="pilotage"
      >
        Pilotage 360°
      </PageTitle>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Du">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Au">
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Classe (assiduité et alertes)">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void load(from, to, classId)} disabled={loading || !from || !to} className="w-full">
              <RefreshCw size={16} /> Actualiser
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => void load(undefined, undefined, classId)}>
            Ce mois-ci
          </button>
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => preset(7)}>
            7 derniers jours
          </button>
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => preset(30)}>
            30 derniers jours
          </button>
          <button type="button" className="rounded-full border border-border px-3 py-1.5 hover:bg-surface-muted" onClick={() => preset(90)}>
            90 derniers jours
          </button>
        </div>
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Calcul en cours…
        </p>
      )}

      {data && a && t && (
        <div className={loading ? "opacity-60" : ""}>
          {/* Indicateurs clés */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Taux de présence" value={fmtPct(a.totaux.tauxPresence)} hint={`${a.totaux.total} présences saisies, ${plural(a.totaux.absents, "absence")}, ${plural(a.totaux.retards, "retard")}`} />
            <Kpi label="Absences non justifiées" value={String(a.totaux.nonJustifiees)} hint={`${a.totaux.enAttente} en attente de décision, ${a.totaux.delaiEnCours} dans le délai`} tone={a.totaux.nonJustifiees > 0 ? "warn" : "ok"} />
            <Kpi label="Appels effectués" value={fmtPct(a.appels.tauxCouverture)} hint={`${a.appels.effectuees} sur ${a.appels.prevues} séances, ${a.appels.manquants} manquants`} tone={a.appels.manquants > 0 ? "warn" : "ok"} />
            <Kpi label="Ponctualité des enseignants" value={fmtPct(t.totaux.tauxPonctualite)} hint={`${plural(t.totaux.retards, "retard")}, ${plural(t.totaux.nonPointes, "non pointé")}, ${String(t.totaux.heuresEffectuees).replace(".", ",")} h effectuées`} />
          </div>

          {/* Alertes */}
          <Card className="mb-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <AlertTriangle size={18} className="text-warning" /> Alertes de décrochage
              </h2>
              {data.alertes.actives && <Badge color={data.alertes.eleves.length > 0 ? "orange" : "green"}>{data.alertes.eleves.length} élève(s) signalé(s)</Badge>}
            </div>
            {!data.alertes.actives ? (
              <p className="text-sm text-ink-muted">
                Les alertes sont désactivées : aucun seuil n&apos;a été fixé. Choisissez le nombre d&apos;absences non justifiées à partir duquel signaler un élève dans{" "}
                <Link href="/vie-scolaire" className="font-medium text-primary underline">
                  Vie scolaire, onglet Assiduité
                </Link>
                .
              </p>
            ) : data.alertes.eleves.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucun élève n&apos;atteint {data.alertes.seuil} absence(s) non justifiée(s) sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3">Élève</th>
                      <th className="py-2 pr-3">Classe</th>
                      <th className="py-2 pr-3 text-right">Non justifiées</th>
                      <th className="py-2 pr-3 text-right">En attente</th>
                      <th className="py-2 pr-3 text-right">Dans le délai</th>
                      <th className="py-2 pr-3 text-right">Retards</th>
                      <th className="py-2">Dernière absence</th>
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
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Assiduité par classe</h2>
              {a.parClasse.length === 0 ? (
                <EmptyState title="Aucun appel sur cette période." />
              ) : (
                <ul className="space-y-3">
                  {a.parClasse.map((c) => (
                    <li key={c.classId}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{c.classe}</span>
                        <span className="text-ink-muted">
                          absence {fmtPct(c.tauxAbsence)} · retard {fmtPct(c.tauxRetard)} · {c.nonJustifiees} non justifiée(s)
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`Taux d'absence ${fmtPct(c.tauxAbsence)}`}>
                        <div className="h-full rounded-full bg-danger" style={{ width: `${Math.min(100, c.tauxAbsence ?? 0)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Taux d&apos;absence par jour</h2>
              {a.parJour.length === 0 ? (
                <EmptyState title="Aucun appel sur cette période." />
              ) : (
                <div className="flex h-40 items-end gap-1 overflow-x-auto pb-1">
                  {a.parJour.map((j) => (
                    <div key={j.date} className="flex min-w-6 flex-1 flex-col items-center justify-end gap-1" title={`${fmtDay(j.date)} : absence ${fmtPct(j.tauxAbsence)}, ${j.absents} sur ${j.total}`}>
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
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">Appels non faits</h2>
            <p className="mb-2 text-xs text-ink-muted">Séances prévues à l&apos;emploi du temps, non annulées, pour lesquelles aucun appel n&apos;a été saisi (les plus récentes d&apos;abord).</p>
            {a.appels.dernieres.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucun appel manquant sur cette période.</p>
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
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">Ponctualité des enseignants</h2>
            <p className="mb-2 text-xs text-ink-muted">
              D&apos;après les pointages validés. Un début pointé plus de {t.toleranceRetardMinutes} minutes après l&apos;heure prévue est un retard. Les enseignants qui pointent à l&apos;arrivée sont comptés en jours, les autres en séances.
              Le filtre de classe ne s&apos;applique pas ici.
            </p>
            {t.lignes.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune séance prévue sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3">Enseignant</th>
                      <th className="py-2 pr-3 text-right">Prévues</th>
                      <th className="py-2 pr-3 text-right">Tenues</th>
                      <th className="py-2 pr-3 text-right">Non pointées</th>
                      <th className="py-2 pr-3 text-right">À valider</th>
                      <th className="py-2 pr-3 text-right">Retards</th>
                      <th className="py-2 pr-3 text-right">Présence</th>
                      <th className="py-2 text-right">Ponctualité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.lignes.map((l) => (
                      <tr key={l.teacherId} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium text-ink">
                          {l.enseignant} <span className="text-xs font-normal text-ink-muted">({l.unite})</span>
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
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">Exporter</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Fichiers CSV (Excel) de la période affichée, recalculés au moment de l&apos;export. Chaque export est enregistré dans le journal d&apos;audit ; la liste des alertes contient des noms d&apos;élèves.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((e) => (
                <Button key={e.kind} variant="secondary" onClick={() => void download(e.kind)} disabled={e.kind === "alertes" && !data.alertes.actives}>
                  <Download size={16} /> {e.label}
                </Button>
              ))}
            </div>
          </Card>

          <p className="mt-4 text-xs text-ink-muted">
            Période du {fmtDay(data.periode.from)} au {fmtDay(data.periode.to)} ({data.periode.days} jour{data.periode.days > 1 ? "s" : ""}). Règles utilisées : retard jusqu&apos;à {data.parametres.retardMaxMinutes} minutes, justificatif sous{" "}
            {data.parametres.delaiJustificatifJours} jours de classe.
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
