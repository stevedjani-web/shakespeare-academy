"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudOff, Pencil, Trash2 } from "lucide-react";
import { api, isOfflineError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { submitOrQueue } from "@/lib/offline-actions";
import { frDay, frShort, TEXTBOOK_MAX_LENGTH, type TextbookContext, type TextbookRow } from "@/lib/textbook";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

const TEXTAREA =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface Draft {
  date: string;
  contenu: string;
  devoirs: string;
  dateEcheance: string;
}

/**
 * Cahier de textes : ce qui a été fait en cours et le travail à faire. Un enseignant écrit pour ses matières et lit les
 * classes où il enseigne ; les autres profils autorisés lisent seulement. Texte seul, visible des parents dès
 * l'enregistrement. La création fonctionne sans Internet (envoyée au retour du réseau).
 */
export function TextbookPanel({ context }: { context: TextbookContext }) {
  const { t } = useI18n();
  const today = context.aujourdhui;
  const [classId, setClassId] = useState(context.classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<TextbookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; queued: boolean } | null>(null);

  // Formulaire de création.
  const mine = context.affectations;
  const [target, setTarget] = useState(() => (mine[0] ? `${mine[0].classId}:${mine[0].subjectId}` : ""));
  const [draft, setDraft] = useState<Draft>({ date: today, contenu: "", devoirs: "", dateEcheance: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);

  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of context.affectations) if (a.classId === classId) seen.set(a.subjectId, a.subjectName);
    return [...seen.entries()].map(([id, nom]) => ({ id, nom }));
  }, [context.affectations, classId]);

  const load = useCallback(async () => {
    if (!classId) {
      setRows([]);
      return;
    }
    try {
      const from = addDays(today, -Number(days));
      const q = `classId=${classId}&from=${from}${subjectId ? `&subjectId=${subjectId}` : ""}`;
      setRows(await api.get<TextbookRow[]>(`/textbook?${q}`));
      setError(null);
    } catch (err) {
      // Sans Internet, la liste n'est pas copiée sur l'appareil, mais la saisie d'une entrée reste possible : on le dit
      // calmement plutôt que d'afficher une erreur au-dessus d'un formulaire qui marche.
      setError(isOfflineError(err) ? t("acd.tb.offlineList") : describeError(err));
    }
  }, [classId, subjectId, days, today, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const [tClass, tSubject] = target.split(":");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        classId: tClass,
        subjectId: tSubject,
        date: draft.date,
        ...(draft.contenu.trim() ? { contenu: draft.contenu.trim() } : {}),
        ...(draft.devoirs.trim() ? { devoirs: draft.devoirs.trim() } : {}),
        ...(draft.devoirs.trim() && draft.dateEcheance ? { dateEcheance: draft.dateEcheance } : {}),
      };
      const label = mine.find((a) => `${a.classId}:${a.subjectId}` === target);
      const res = await submitOrQueue<TextbookRow>({
        kind: "textbook",
        method: "POST",
        path: "/textbook",
        body,
        label: t("acd.tb.queueLabel", { subject: label?.subjectName ?? "", class: label?.className ?? "" }),
      });
      setDraft({ date: draft.date, contenu: "", devoirs: "", dateEcheance: "" });
      if (res.queued) {
        setNotice({ text: t("acd.tb.queuedNotice"), queued: true });
      } else {
        setNotice({ text: t("acd.tb.savedNotice"), queued: false });
        if (tClass !== classId) setClassId(tClass);
        await load();
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setError(null);
    try {
      await api.patch(`/textbook/${editing.id}`, {
        date: editing.draft.date,
        contenu: editing.draft.contenu,
        devoirs: editing.draft.devoirs,
        dateEcheance: editing.draft.devoirs.trim() ? editing.draft.dateEcheance : "",
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function remove(row: TextbookRow) {
    if (!window.confirm(t("acd.tb.confirmDelete", { date: frShort(row.date), subject: row.subjectName }))) return;
    try {
      await api.delete(`/textbook/${row.id}`);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (context.classes.length === 0) {
    return <EmptyState title={t("acd.tb.noClassTitle")} description={t("acd.tb.noClassDesc")} />;
  }

  return (
    <div className="space-y-4">
      {context.peutEcrire && mine.length > 0 && (
        <Card>
          <form onSubmit={create} className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">{t("acd.tb.newEntry")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("acd.tb.classAndSubject")}>
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {mine.map((a) => (
                    <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>
                      {a.className} · {a.subjectName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("acd.tb.sessionDate")}>
                <Input
                  type="date"
                  required
                  value={draft.date}
                  min={context.annee?.dateDebut}
                  max={today}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("acd.tb.doneInClass")}>
              <textarea
                className={TEXTAREA}
                rows={3}
                maxLength={TEXTBOOK_MAX_LENGTH}
                value={draft.contenu}
                onChange={(e) => setDraft({ ...draft, contenu: e.target.value })}
                placeholder={t("acd.tb.doneInClassPlaceholder")}
              />
            </Field>
            <Field label={t("acd.tb.homework")}>
              <textarea
                className={TEXTAREA}
                rows={3}
                maxLength={TEXTBOOK_MAX_LENGTH}
                value={draft.devoirs}
                onChange={(e) => setDraft({ ...draft, devoirs: e.target.value })}
                placeholder={t("acd.tb.homeworkPlaceholder")}
              />
            </Field>
            {draft.devoirs.trim() && (
              <div className="sm:w-64">
                <Field label={t("acd.tb.dueOptional")}>
                  <Input type="date" value={draft.dateEcheance} min={draft.date} onChange={(e) => setDraft({ ...draft, dateEcheance: e.target.value })} />
                </Field>
              </div>
            )}
            <p className="text-xs text-ink-muted">{t("acd.tb.textOnly")}</p>
            <Button type="submit" disabled={busy || (!draft.contenu.trim() && !draft.devoirs.trim())}>
              {busy && <Spinner />} {t("acd.tb.saveEntry")}
            </Button>
          </form>
        </Card>
      )}

      {notice && (
        <div>
          {notice.queued ? (
            <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">
              <CloudOff size={15} /> {notice.text}
            </p>
          ) : (
            <SuccessMessage>{notice.text}</SuccessMessage>
          )}
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("acd.tb.filterClass")}>
            <Select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId("");
              }}
            >
              {context.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("acd.tb.filterSubject")}>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">{t("acd.tb.allSubjects")}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("acd.tb.filterPeriod")}>
            <Select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">{t("acd.tb.days7")}</option>
              <option value="30">{t("acd.tb.days30")}</option>
              <option value="90">{t("acd.tb.days90")}</option>
              <option value="365">{t("acd.tb.wholeYear")}</option>
            </Select>
          </Field>
        </div>
      </Card>

      {rows === null ? (
        <Spinner className="h-6 w-6 text-primary" />
      ) : rows.length === 0 ? (
        <EmptyState title={t("acd.tb.emptyTitle")} description={t("acd.tb.emptyDesc")} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border bg-surface p-3">
              {editing?.id === row.id ? (
                <div className="space-y-2">
                  <Field label={t("acd.tb.sessionDate")}>
                    <Input type="date" max={today} value={editing.draft.date} onChange={(e) => setEditing({ id: row.id, draft: { ...editing.draft, date: e.target.value } })} />
                  </Field>
                  <Field label={t("acd.tb.doneInClass")}>
                    <textarea className={TEXTAREA} rows={3} maxLength={TEXTBOOK_MAX_LENGTH} value={editing.draft.contenu} onChange={(e) => setEditing({ id: row.id, draft: { ...editing.draft, contenu: e.target.value } })} />
                  </Field>
                  <Field label={t("acd.tb.homework")}>
                    <textarea className={TEXTAREA} rows={3} maxLength={TEXTBOOK_MAX_LENGTH} value={editing.draft.devoirs} onChange={(e) => setEditing({ id: row.id, draft: { ...editing.draft, devoirs: e.target.value } })} />
                  </Field>
                  {editing.draft.devoirs.trim() && (
                    <div className="sm:w-64">
                      <Field label={t("acd.tb.due")}>
                        <Input type="date" min={editing.draft.date} value={editing.draft.dateEcheance} onChange={(e) => setEditing({ id: row.id, draft: { ...editing.draft, dateEcheance: e.target.value } })} />
                      </Field>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={saveEdit}>{t("acd.tb.save")}</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      {t("acd.tb.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {frDay(row.date)} · {row.subjectName}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {row.className} · {row.teacherName}
                      </p>
                    </div>
                    {row.modifiable && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          aria-label={t("acd.tb.edit")}
                          onClick={() => setEditing({ id: row.id, draft: { date: row.date, contenu: row.contenu ?? "", devoirs: row.devoirs ?? "", dateEcheance: row.dateEcheance ?? "" } })}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button variant="ghost" aria-label={t("acd.tb.delete")} onClick={() => remove(row)}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {row.contenu && (
                    <p className="mt-2 whitespace-pre-line text-sm text-ink">
                      <span className="font-medium">{t("acd.tb.doneLabel")}</span>
                      {row.contenu}
                    </p>
                  )}
                  {row.devoirs && (
                    <p className="mt-2 whitespace-pre-line rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink">
                      <span className="font-medium">{t("acd.tb.todoLabel")}</span>
                      {row.devoirs}
                      {row.dateEcheance && (
                        <span className="ml-2 inline-block">
                          <Badge color="orange">{t("acd.tb.dueBadge", { date: frShort(row.dateEcheance) })}</Badge>
                        </span>
                      )}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
