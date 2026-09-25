"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { LinkableUser, Subject, Teacher } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { Users } from "lucide-react";
import { describeError, TAB_HINT } from "./shared";

/** Fiches enseignants (D56) : coordonnées et matières. Aucune donnée de paie ni de contrat. */
export function EnseignantsTab({ onChanged }: { onChanged: () => void }) {
  const { t: tr } = useI18n(); // « t » désigne un enseignant dans tout ce fichier
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [users, setUsers] = useState<LinkableUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ nom: "", prenom: "", telephone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nom: "", prenom: "", telephone: "", email: "" });
  const [subjectDraft, setSubjectDraft] = useState<Record<string, string[]>>({});
  const expand = useExpanded();

  async function load() {
    const [t, s, u] = await Promise.all([
      api.get<Teacher[]>("/teachers"),
      api.get<Subject[]>("/subjects"),
      api.get<LinkableUser[]>("/teachers/linkable-users").catch(() => [] as LinkableUser[]),
    ]);
    setUsers(u);
    setTeachers(t);
    setSubjects(s.filter((x) => x.actif));
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch((e) => {
      setError(describeError(e));
      setLoaded(true);
    });
  }, []);

  const currentSubjects = (t: Teacher) => subjectDraft[t.id] ?? t.subjects.map((s) => s.subjectId);

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/teachers", {
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone || undefined,
        email: form.email || undefined,
      });
      setForm({ nom: "", prenom: "", telephone: "", email: "" });
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function saveEdit(id: string) {
    setError(null);
    try {
      await api.patch(`/teachers/${id}`, editForm);
      setEditing(null);
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function toggleStatus(t: Teacher) {
    setError(null);
    try {
      await api.patch(`/teachers/${t.id}`, { statut: t.statut === "ACTIF" ? "INACTIF" : "ACTIF" });
      await load();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function savePointage(t: Teacher, data: { userId?: string | null; modePointage?: "SEANCE" | "JOURNEE" }) {
    setError(null);
    try {
      await api.patch(`/teachers/${t.id}`, data);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function saveSubjects(t: Teacher) {
    setError(null);
    try {
      await api.put(`/teachers/${t.id}/subjects`, { subjectIds: currentSubjects(t) });
      setSubjectDraft((d) => {
        const next = { ...d };
        delete next[t.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-ink">{tr("sl.teachers.title")}</h2>
      <p className={`mb-3 ${TAB_HINT}`}>
        {tr("sl.teachers.hint")}
      </p>
      <ErrorMessage>{error}</ErrorMessage>

      <form onSubmit={addTeacher} className="mb-5 space-y-3 border-b border-border pb-4">
        <p className="text-sm font-semibold text-ink">{tr("sl.teachers.add.title")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("sl.teachers.add.lastName")}>
            <Input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </Field>
          <Field label={tr("sl.teachers.add.firstName")}>
            <Input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
          </Field>
          <Field label={tr("sl.teachers.add.phone")}>
            <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
          </Field>
          <Field label={tr("sl.teachers.add.email")}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <Button type="submit">{tr("sl.teachers.add.submit")}</Button>
      </form>

      {loaded && teachers.length === 0 ? (
        <EmptyState icon={<Users />} title={tr("sl.teachers.empty.title")} description={tr("sl.teachers.empty.description")} />
      ) : (
        <>
          <ExpandAll count={teachers.length} onOpenAll={() => expand.openAll(teachers.map((t) => t.id))} onCloseAll={expand.closeAll} />
          <ul className="space-y-2">
            {teachers.map((t) => {
              const expanded = expand.isOpen(t.id);
              const selected = currentSubjects(t);
              const isEditing = editing === t.id;
              return (
                <li key={t.id} className={`rounded-xl border border-border p-3 ${t.statut === "ACTIF" ? "" : "opacity-70"}`}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <ExpandButton open={expanded} onClick={() => expand.toggle(t.id)} label={`${t.prenom} ${t.nom}`} />
                    <span className="font-medium text-ink">
                      {t.prenom} {t.nom}
                    </span>
                    <Badge color="slate">{tr("sl.teachers.subjectCount", { n: t.subjects.length })}</Badge>
                    <Badge color={t._count.assignments > 0 ? "green" : "orange"}>{tr("sl.teachers.assignmentCount", { n: t._count.assignments })}</Badge>
                    {t.statut === "INACTIF" && <Badge color="gray">{tr("sl.teachers.inactive")}</Badge>}
                    {t.volontairePilote && <Badge color="accent">{tr("sl.teachers.pilotVolunteer")}</Badge>}
                  </div>
                  {expanded && (
                    <div className="mt-3 space-y-4 border-t border-border pt-3">
                      {isEditing ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input value={editForm.nom} onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })} placeholder={tr("sl.teachers.add.lastName")} />
                          <Input value={editForm.prenom} onChange={(e) => setEditForm({ ...editForm, prenom: e.target.value })} placeholder={tr("sl.teachers.add.firstName")} />
                          <Input value={editForm.telephone} onChange={(e) => setEditForm({ ...editForm, telephone: e.target.value })} placeholder={tr("sl.teachers.editPhone")} />
                          <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder={tr("sl.teachers.editEmail")} />
                          <div className="flex gap-2 sm:col-span-2">
                            <Button onClick={() => void saveEdit(t.id)}>{tr("sl.common.save")}</Button>
                            <Button variant="secondary" onClick={() => setEditing(null)}>
                              {tr("sl.common.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <p className="text-ink-muted">
                            {tr("sl.teachers.phoneLine")} <span className="font-medium text-ink">{t.telephone ?? "-"}</span> · {tr("sl.teachers.emailLine")}{" "}
                            <span className="font-medium text-ink">{t.email ?? "-"}</span>
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditing(t.id);
                                setEditForm({ nom: t.nom, prenom: t.prenom, telephone: t.telephone ?? "", email: t.email ?? "" });
                              }}
                            >
                              {tr("sl.common.edit")}
                            </Button>
                            <Button variant="secondary" onClick={() => void toggleStatus(t)}>
                              {t.statut === "ACTIF" ? tr("sl.common.deactivate") : tr("sl.common.reactivate")}
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl bg-surface-muted p-3">
                        <p className="mb-2 text-sm font-medium text-ink">{tr("sl.teachers.checkin.title")}</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label={tr("sl.teachers.checkin.how")}>
                            <Select value={t.modePointage} onChange={(e) => void savePointage(t, { modePointage: e.target.value as "SEANCE" | "JOURNEE" })}>
                              <option value="SEANCE">{tr("sl.teachers.checkin.SEANCE")}</option>
                              <option value="JOURNEE">{tr("sl.teachers.checkin.JOURNEE")}</option>
                            </Select>
                          </Field>
                          <Field label={tr("sl.teachers.checkin.account")}>
                            <Select value={t.userId ?? ""} onChange={(e) => void savePointage(t, { userId: e.target.value || null })}>
                              <option value="">{tr("sl.teachers.checkin.noAccount")}</option>
                              {users
                                .filter((u) => u.teacherId === null || u.teacherId === t.id)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.prenom} {u.nom} ({u.role})
                                  </option>
                                ))}
                            </Select>
                          </Field>
                        </div>
                        <p className={`mt-2 ${TAB_HINT}`}>{tr("sl.teachers.checkin.hint")}</p>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium text-ink">{tr("sl.teachers.subjects.title")}</p>
                        {subjects.length === 0 ? (
                          <p className={TAB_HINT}>{tr("sl.teachers.subjects.none")}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {subjects.map((s) => (
                              <label key={s.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(s.id)}
                                  onChange={(e) =>
                                    setSubjectDraft({
                                      ...subjectDraft,
                                      [t.id]: e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id),
                                    })
                                  }
                                />
                                {s.nom}
                              </label>
                            ))}
                          </div>
                        )}
                        {subjectDraft[t.id] && (
                          <Button className="mt-3" onClick={() => void saveSubjects(t)}>
                            {tr("sl.teachers.subjects.save")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
