"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, FilePlus2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type {
  Class,
  Room,
  Teacher,
  TimeSlot,
  Timetable,
  TimetableCheck,
  TimetableEntry,
  TimetableWeek,
} from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, SuccessMessage } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { buildSection, type ExportColumn } from "@/lib/export";
import { describeError, useStructure } from "@/components/vie-scolaire/shared";
import { VersionGrid } from "@/components/emploi-du-temps/version-grid";
import { WeekView } from "@/components/emploi-du-temps/week-view";
import { VIEW_LABELS, dayLabel, formatIso, shiftWeek, type ViewKind } from "@/components/emploi-du-temps/shared";

type Mode = "version" | "semaine";

const STATUS_LABEL = { BROUILLON: "Brouillon", PUBLIE: "En vigueur", ARCHIVE: "Archivée" } as const;
const STATUS_COLOR = { BROUILLON: "orange", PUBLIE: "green", ARCHIVE: "gray" } as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Emploi du temps (Lot 8, addendum v1.1) : séances récurrentes par version (brouillon, publiée, archivée)
// et semaine réelle avec changements ponctuels. Les conflits d'enseignant, de salle ou de classe sont refusés.
export default function EmploiDuTempsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("PEDAGOGY_MANAGE");
  const structure = useStructure();

  const [mode, setMode] = useState<Mode>("version");
  const [yearId, setYearId] = useState("");
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [timetableId, setTimetableId] = useState("");
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [joursClasse, setJoursClasse] = useState<number[]>([1, 2, 3, 4, 5]);
  const [view, setView] = useState<ViewKind>("classe");
  const [targetId, setTargetId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [week, setWeek] = useState<TimetableWeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [check, setCheck] = useState<TimetableCheck | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [dateEffet, setDateEffet] = useState("");

  useEffect(() => {
    if (!yearId && structure.activeYear) setYearId(structure.activeYear.id);
  }, [structure.activeYear, yearId]);

  // Données de référence : créneaux, salles, jours de classe, enseignants (pour les remplacements).
  useEffect(() => {
    void Promise.all([
      api.get<TimeSlot[]>("/time-slots"),
      api.get<Room[]>("/rooms"),
      api.get<{ joursClasse: number[] }>("/pedagogy/settings"),
    ])
      .then(([s, r, p]) => {
        setSlots(s);
        setRooms(r);
        setJoursClasse(p.joursClasse);
      })
      .catch((e) => setError(describeError(e)));
    if (canManage) void api.get<Teacher[]>("/teachers").then(setTeachers).catch(() => setTeachers([]));
  }, [canManage]);

  useEffect(() => {
    if (!yearId) return;
    void api.get<Class[]>(`/classes?academicYearId=${yearId}`).then(setClasses).catch(() => setClasses([]));
  }, [yearId]);

  const loadTimetables = useCallback(
    async (preferId?: string) => {
      if (!yearId) return;
      try {
        const list = await api.get<Timetable[]>(`/timetables?academicYearId=${yearId}`);
        setTimetables(list);
        setTimetableId((current) => {
          if (preferId && list.some((t) => t.id === preferId)) return preferId;
          if (current && list.some((t) => t.id === current)) return current;
          return (list.find((t) => t.statut === "PUBLIE") ?? list[0])?.id ?? "";
        });
      } catch (e) {
        setError(describeError(e));
      }
    },
    [yearId],
  );

  useEffect(() => {
    void loadTimetables();
  }, [loadTimetables]);

  const loadEntries = useCallback(async () => {
    if (!timetableId) {
      setEntries([]);
      return;
    }
    try {
      setEntries(await api.get<TimetableEntry[]>(`/timetables/${timetableId}/entries`));
    } catch (e) {
      setError(describeError(e));
    }
  }, [timetableId]);

  useEffect(() => {
    void loadEntries();
    setCheck(null);
    setPublishing(false);
  }, [loadEntries]);

  const timetable = timetables.find((t) => t.id === timetableId) ?? null;
  const isDraft = timetable?.statut === "BROUILLON";
  const hasDraft = timetables.some((t) => t.statut === "BROUILLON");

  // Cibles disponibles selon la vue (les enseignants se déduisent des séances : la liste complète est réservée aux gestionnaires).
  const targets = useMemo(() => {
    if (view === "classe") return classes.map((c) => ({ id: c.id, label: c.nom }));
    if (view === "salle") return rooms.map((r) => ({ id: r.id, label: r.nom }));
    const seen = new Map<string, string>();
    for (const e of entries) seen.set(e.teacherId, `${e.teacher.prenom} ${e.teacher.nom}`);
    return [...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [view, classes, rooms, entries]);

  useEffect(() => {
    if (mode === "semaine") return; // la semaine accepte « Tous »
    if (!targets.some((t) => t.id === targetId)) setTargetId(targets[0]?.id ?? "");
  }, [targets, targetId, mode]);

  const loadWeek = useCallback(async () => {
    const filter = targetId
      ? `&${view === "classe" ? "classId" : view === "enseignant" ? "teacherId" : "roomId"}=${targetId}`
      : "";
    try {
      setWeek(await api.get<TimetableWeek>(`/timetable/week?date=${date}${filter}`));
    } catch (e) {
      setError(describeError(e));
    }
  }, [date, targetId, view]);

  useEffect(() => {
    if (mode === "semaine") void loadWeek();
  }, [mode, loadWeek]);

  // Créneaux de la grille de la classe : ceux de sa section s'il y en a, sinon les créneaux communs.
  const classSlots = useMemo(() => {
    const klass = classes.find((c) => c.id === targetId);
    const level = structure.levels.find((l) => l.id === klass?.levelId);
    const cycle = structure.cycles.find((c) => c.id === level?.cycleId);
    const own = slots.filter((s) => s.sectionId === cycle?.sectionId);
    return own.length > 0 ? own : slots.filter((s) => s.sectionId === null);
  }, [classes, targetId, slots, structure.levels, structure.cycles]);

  const shown = useMemo(
    () =>
      entries.filter((e) => {
        if (!targetId) return true;
        if (view === "classe") return e.classId === targetId;
        if (view === "enseignant") return e.teacherId === targetId;
        return e.roomId === targetId;
      }),
    [entries, targetId, view],
  );

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function createVersion(vide: boolean) {
    await run(async () => {
      const created = await api.post<Timetable>("/timetables", { academicYearId: yearId, vide });
      await loadTimetables(created.id);
    }, "Nouvelle version créée en brouillon.");
  }

  async function publish() {
    if (!timetable) return;
    await run(async () => {
      await api.post(`/timetables/${timetable.id}/publish`, { dateEffet });
      setPublishing(false);
      await loadTimetables(timetable.id);
      await loadEntries();
    }, "Version publiée. Elle s'applique à partir de la date d'effet.");
  }

  async function verify() {
    if (!timetable) return;
    await run(async () => setCheck(await api.get<TimetableCheck>(`/timetables/${timetable.id}/check`)));
  }

  async function resync() {
    if (!timetable) return;
    await run(async () => {
      const r = await api.post<{ misAJour: number; problemes: string[] }>(`/timetables/${timetable.id}/resync`, {});
      await loadEntries();
      setNotice(
        `${r.misAJour} enseignant(s) mis à jour.${r.problemes.length > 0 ? ` À vérifier : ${r.problemes.join(" ")}` : ""}`,
      );
    });
  }

  async function removeDraft() {
    if (!timetable || !window.confirm("Supprimer ce brouillon et toutes ses séances ?")) return;
    await run(async () => {
      await api.delete(`/timetables/${timetable.id}`);
      setTimetableId("");
      await loadTimetables();
    }, "Brouillon supprimé.");
  }

  // Export PDF/Excel de ce qui est affiché à l'écran.
  const versionColumns: ExportColumn<TimetableEntry>[] = [
    { header: "Jour", value: (e) => dayLabel(e.jourSemaine) },
    { header: "Début", value: (e) => e.heureDebut },
    { header: "Fin", value: (e) => e.heureFin },
    { header: "Classe", value: (e) => e.class.nom },
    { header: "Matière", value: (e) => e.subject.nom },
    { header: "Enseignant", value: (e) => `${e.teacher.prenom} ${e.teacher.nom}` },
    { header: "Salle", value: (e) => e.room.nom },
  ];
  const sortedShown = [...shown].sort(
    (a, b) => ((a.jourSemaine + 6) % 7) - ((b.jourSemaine + 6) % 7) || a.heureDebut.localeCompare(b.heureDebut),
  );
  const targetLabel = targets.find((t) => t.id === targetId)?.label ?? "Tous";
  const versionSection = buildSection(`Emploi du temps, ${targetLabel}`, versionColumns, sortedShown);
  const weekSection = buildSection(
    `Semaine du ${week ? formatIso(week.debut) : ""}`,
    [
      { header: "Date", value: (r: { date: string }) => formatIso(r.date) },
      { header: "Début", value: (r: { heureDebut: string }) => r.heureDebut },
      { header: "Fin", value: (r: { heureFin: string }) => r.heureFin },
      { header: "Classe", value: (r: { className: string }) => r.className },
      { header: "Matière", value: (r: { subjectName: string }) => r.subjectName },
      { header: "Enseignant", value: (r: { teacherName: string }) => r.teacherName },
      { header: "Salle", value: (r: { roomName: string }) => r.roomName },
      { header: "Statut", value: (r: { statut: string }) => r.statut },
    ],
    (week?.jours ?? []).flatMap((j) => j.seances),
  );

  const versionTitle = timetable
    ? `Version ${timetable.numero}${timetable.dateEffet ? `, depuis le ${formatIso(timetable.dateEffet.slice(0, 10))}` : ""}`
    : "";

  return (
    <div>
      <PageTitle
        eyebrow="Vie scolaire"
        subtitle="Séances de la semaine par classe, enseignant et salle. Les conflits sont refusés ; les versions publiées ne changent plus."
      >
        Emploi du temps
      </PageTitle>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface-muted p-1">
        {(
          [
            ["version", "Versions"],
            ["semaine", "Semaine réelle"],
          ] as Array<[Mode, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setMode(key);
              setError(null);
              setNotice(null);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              mode === key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Année scolaire">
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {structure.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.libelle}
                </option>
              ))}
            </Select>
          </Field>
          {mode === "version" && (
            <Field label="Version">
              <Select value={timetableId} onChange={(e) => setTimetableId(e.target.value)} disabled={timetables.length === 0}>
                {timetables.length === 0 && <option value="">Aucune version</option>}
                {timetables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Version {t.numero} ({STATUS_LABEL[t.statut]})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Affichage">
            <Select
              value={view}
              onChange={(e) => {
                setView(e.target.value as ViewKind);
                setTargetId("");
              }}
            >
              {(Object.keys(VIEW_LABELS) as ViewKind[])
                .filter((k) => mode === "version" || canManage || k !== "enseignant")
                .map((k) => (
                  <option key={k} value={k}>
                    {VIEW_LABELS[k]}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={view === "classe" ? "Classe" : view === "enseignant" ? "Enseignant" : "Salle"}>
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {mode === "semaine" && <option value="">Tous</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {mode === "version" && (
        <Card>
          {!timetable ? (
            <EmptyState
              icon={<CalendarRange />}
              title="Aucun emploi du temps pour cette année."
              description={
                canManage
                  ? "Créez une première version : vous saisirez les séances classe par classe, puis vous la publierez."
                  : "L'emploi du temps n'est pas encore publié."
              }
              action={
                canManage ? (
                  <Button onClick={() => void createVersion(true)} disabled={!yearId}>
                    <FilePlus2 size={16} /> Créer une version
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">{versionTitle}</h2>
                  <Badge color={STATUS_COLOR[timetable.statut]}>{STATUS_LABEL[timetable.statut]}</Badge>
                  <span className="text-xs text-ink-muted">{timetable._count.entries} séance(s)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ExportButtons
                    fileName={`emploi-du-temps-${targetLabel}`}
                    title={`Emploi du temps, ${targetLabel}`}
                    subtitle={versionTitle}
                    sections={[versionSection]}
                    landscape
                  />
                  {canManage && !hasDraft && (
                    <Button variant="secondary" onClick={() => void createVersion(false)}>
                      <FilePlus2 size={16} /> Nouvelle version
                    </Button>
                  )}
                </div>
              </div>

              {isDraft && canManage && (
                <div className="mb-4 space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-3">
                  <p className="text-sm text-ink">
                    Brouillon : ajoutez les séances dans la vue « Par classe » (bouton +). Rien n&apos;est visible des autres tant que la version n&apos;est pas publiée.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => void verify()}>
                      <ShieldCheck size={16} /> Vérifier
                    </Button>
                    <Button variant="secondary" onClick={() => void resync()}>
                      <RefreshCw size={16} /> Mettre à jour les enseignants
                    </Button>
                    <Button
                      onClick={() => {
                        setPublishing(true);
                        setDateEffet((d) => d || todayIso());
                      }}
                    >
                      Publier
                    </Button>
                    <Button variant="danger" onClick={() => void removeDraft()}>
                      <Trash2 size={16} /> Supprimer le brouillon
                    </Button>
                  </div>
                  {check && (
                    <div className="text-sm">
                      {check.pret ? (
                        <SuccessMessage>Aucun conflit : {check.seances} séance(s) prêtes à être publiées.</SuccessMessage>
                      ) : (
                        <ul className="list-disc space-y-1 rounded-xl bg-danger-soft py-2 pl-7 pr-3 text-danger">
                          {check.seances === 0 && <li>L&apos;emploi du temps est vide.</li>}
                          {check.problemes.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {publishing && (
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Date d'effet (premier jour d'application)">
                        <Input type="date" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} />
                      </Field>
                      <Button onClick={() => void publish()} disabled={!dateEffet}>
                        Confirmer la publication
                      </Button>
                      <Button variant="ghost" onClick={() => setPublishing(false)}>
                        Annuler
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {targets.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {view === "classe" ? "Aucune classe pour cette année." : "Aucune séance pour cette vue."}
                </p>
              ) : (
                <VersionGrid
                  timetableId={timetable.id}
                  view={view}
                  targetId={targetId}
                  entries={shown}
                  slots={slots}
                  rooms={rooms}
                  joursClasse={joursClasse}
                  editable={isDraft && canManage}
                  classSlots={classSlots}
                  onChanged={() => {
                    void loadEntries();
                    void loadTimetables(timetable.id);
                    setCheck(null);
                  }}
                />
              )}
            </>
          )}
        </Card>
      )}

      {mode === "semaine" && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" aria-label="Semaine précédente" onClick={() => setDate((d) => shiftWeek(d, -7))}>
                <ChevronLeft size={16} />
              </Button>
              <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
              <Button variant="secondary" aria-label="Semaine suivante" onClick={() => setDate((d) => shiftWeek(d, 7))}>
                <ChevronRight size={16} />
              </Button>
              <Button variant="ghost" onClick={() => setDate(todayIso())}>
                Aujourd&apos;hui
              </Button>
            </div>
            <ExportButtons
              fileName={`semaine-${week?.debut ?? date}`}
              title="Emploi du temps de la semaine"
              subtitle={week ? `Du ${formatIso(week.debut)} au ${formatIso(week.fin)}` : undefined}
              sections={[weekSection]}
              landscape
            />
          </div>
          {week && (
            <WeekView week={week} canManage={canManage} teachers={teachers} rooms={rooms} onChanged={() => void loadWeek()} />
          )}
        </div>
      )}
    </div>
  );
}
