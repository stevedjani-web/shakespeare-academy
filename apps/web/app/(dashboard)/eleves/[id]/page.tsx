"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, isOfflineError } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { useOnOutboxChange } from "@/lib/outbox";
import type { Class, Enrollment, Student, StudentDossier } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import { FinancialStatusCard } from "@/components/financial-status-card";
import { ArrowLeft, CalendarDays, IdCard, Pencil, UserPlus, Users } from "lucide-react";

const SEXE_LABEL: Record<string, string> = { M: "Masculin", F: "Féminin" };

function describeError(err: unknown): string {
  if (isOfflineError(err)) return "Cette action nécessite une connexion Internet. Réessayez quand elle sera revenue.";
  return isApiError(err) ? err.message : "Une erreur est survenue.";
}
const ENROLLMENT_STATUS_BADGE: Record<string, { label: string; color: "green" | "gray" }> = {
  ACTIVE: { label: "Active", color: "green" },
  ANNULEE: { label: "Annulée", color: "gray" },
};

export default function StudentDossierPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("ENROLLMENT_MANAGE");

  const [student, setStudent] = useState<StudentDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardianForm, setGuardianForm] = useState({ nom: "", prenom: "", telephone: "", lien: "" });
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({ nom: "", prenom: "", sexe: "M", dateNaissance: "", nationalite: "" });
  const [studentError, setStudentError] = useState<string | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const data = await api.get<StudentDossier>(`/students/${params.id}`);
    setStudent(data);
  }

  useEffect(() => {
    void load().catch((err) => setError(describeError(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleAttachGuardian(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await submitOrQueue({
        kind: "guardian",
        method: "POST",
        path: `/students/${params.id}/guardians`,
        body: guardianForm,
        label: `${guardianForm.prenom} ${guardianForm.nom} (${guardianForm.lien}) pour ${student?.prenom ?? ""} ${student?.nom ?? ""}`.trim(),
        studentId: params.id,
      });
      setGuardianForm({ nom: "", prenom: "", telephone: "", lien: "" });
      setShowGuardianForm(false);
      if (res.queued) setNotice("Responsable enregistré sur cet appareil : il sera ajouté au dossier au retour d'Internet.");
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function handleDetachGuardian(guardianId: string) {
    if (!confirm("Détacher ce responsable de l'élève ?")) return;
    try {
      await api.delete(`/students/${params.id}/guardians/${guardianId}`);
      await load();
    } catch (err) {
      alert(describeError(err));
    }
  }

  function startEditStudent() {
    if (!student) return;
    setStudentForm({
      nom: student.nom,
      prenom: student.prenom,
      sexe: student.sexe,
      dateNaissance: student.dateNaissance.slice(0, 10),
      nationalite: student.nationalite ?? "",
    });
    setStudentError(null);
    setEditingStudent(true);
  }

  async function handleSaveStudent(e: React.FormEvent) {
    e.preventDefault();
    setStudentError(null);
    setSavingStudent(true);
    try {
      const res = await submitOrQueue({
        kind: "student-update",
        method: "PATCH",
        path: `/students/${params.id}`,
        body: studentForm,
        label: `Correction de ${studentForm.prenom} ${studentForm.nom}`,
        studentId: params.id,
      });
      setEditingStudent(false);
      if (res.queued) {
        setNotice("Correction enregistrée sur cet appareil : elle sera envoyée au retour d'Internet.");
        // Affichage immédiat de ce qui a été saisi ; le serveur reste la référence à la synchronisation.
        setStudent((s) => (s ? { ...s, ...studentForm, sexe: studentForm.sexe as Student["sexe"], nationalite: studentForm.nationalite || null } : s));
      } else {
        await load();
      }
    } catch (err) {
      setStudentError(describeError(err));
    } finally {
      setSavingStudent(false);
    }
  }

  async function handleCancelEnrollment(enrollmentId: string) {
    const motif = prompt("Motif de l'annulation (obligatoire) :");
    if (!motif) return;
    try {
      await api.post(`/enrollments/${enrollmentId}/cancel`, { motif });
      await load();
    } catch (err) {
      alert(describeError(err));
    }
  }

  // Quand des saisies hors ligne partent au serveur, on relit le dossier réel.
  useOnOutboxChange(() => void load().catch(() => {}));

  if (!student) return null;

  const activeEnrollment = student.enrollments.find((e) => e.statut === "ACTIVE");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft font-display text-xl font-semibold text-primary">
            {student.prenom.charAt(0)}
            {student.nom.charAt(0)}
          </span>
          <PageTitle subtitle={`Matricule ${student.matricule}`}>
            {student.prenom} {student.nom}
          </PageTitle>
        </div>
        {canManage && (
          <Button onClick={() => router.push(`/eleves/inscription?studentId=${student.id}`)}>
            Inscrire pour une nouvelle année
          </Button>
        )}
      </div>

      {notice && <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <IdCard size={16} className="text-primary" /> Identité
            </h2>
            {canManage && !editingStudent && (
              <Button variant="ghost" onClick={startEditStudent}>
                <Pencil size={14} /> Modifier
              </Button>
            )}
          </div>
          {editingStudent ? (
            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom">
                  <Input
                    required
                    value={studentForm.nom}
                    onChange={(e) => setStudentForm({ ...studentForm, nom: e.target.value })}
                  />
                </Field>
                <Field label="Prénom">
                  <Input
                    required
                    value={studentForm.prenom}
                    onChange={(e) => setStudentForm({ ...studentForm, prenom: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sexe">
                  <Select
                    value={studentForm.sexe}
                    onChange={(e) => setStudentForm({ ...studentForm, sexe: e.target.value })}
                  >
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </Select>
                </Field>
                <Field label="Date de naissance">
                  <Input
                    type="date"
                    required
                    value={studentForm.dateNaissance}
                    onChange={(e) => setStudentForm({ ...studentForm, dateNaissance: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Nationalité">
                <Input
                  value={studentForm.nationalite}
                  onChange={(e) => setStudentForm({ ...studentForm, nationalite: e.target.value })}
                />
              </Field>
              <ErrorMessage>{studentError}</ErrorMessage>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingStudent}>
                  {savingStudent ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditingStudent(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <dl className="space-y-2 text-sm">
              <Row label="Sexe" value={SEXE_LABEL[student.sexe]} />
              <Row label="Date de naissance" value={new Date(student.dateNaissance).toLocaleDateString("fr-FR")} />
              <Row label="Nationalité" value={student.nationalite ?? "—"} />
              <Row
                label="Statut"
                value={<Badge color={student.statut === "ACTIF" ? "green" : "gray"}>{student.statut}</Badge>}
              />
            </dl>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Users size={16} className="text-primary" /> Responsables
            </h2>
            {canManage && (
              <Button variant="secondary" onClick={() => setShowGuardianForm((v) => !v)}>
                <UserPlus size={15} />
                {showGuardianForm ? "Annuler" : "Ajouter"}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border">
            {student.studentGuardians.map((sg) => (
              <li key={sg.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-ink">
                    {sg.guardian.prenom} {sg.guardian.nom}
                  </span>{" "}
                  <span className="text-ink-muted">
                    — {sg.lien} · {sg.guardian.telephone}
                  </span>
                  {sg.prioritaire && (
                    <span className="ml-2">
                      <Badge color="blue">Contact prioritaire</Badge>
                    </span>
                  )}
                </div>
                {canManage && (
                  <Button variant="ghost" onClick={() => void handleDetachGuardian(sg.guardianId)}>
                    Détacher
                  </Button>
                )}
              </li>
            ))}
            {student.studentGuardians.length === 0 && (
              <li className="py-4 text-sm text-ink-muted">Aucun responsable rattaché.</li>
            )}
          </ul>
          {showGuardianForm && (
            <form onSubmit={handleAttachGuardian} className="mt-4 space-y-3 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom">
                  <Input
                    required
                    value={guardianForm.nom}
                    onChange={(e) => setGuardianForm({ ...guardianForm, nom: e.target.value })}
                  />
                </Field>
                <Field label="Prénom">
                  <Input
                    required
                    value={guardianForm.prenom}
                    onChange={(e) => setGuardianForm({ ...guardianForm, prenom: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Téléphone">
                  <Input
                    required
                    value={guardianForm.telephone}
                    onChange={(e) => setGuardianForm({ ...guardianForm, telephone: e.target.value })}
                  />
                </Field>
                <Field label="Lien (Père, Mère, Tuteur…)">
                  <Input
                    required
                    value={guardianForm.lien}
                    onChange={(e) => setGuardianForm({ ...guardianForm, lien: e.target.value })}
                  />
                </Field>
              </div>
              <ErrorMessage>{error}</ErrorMessage>
              <Button type="submit">Rattacher</Button>
            </form>
          )}
        </Card>

        <div className="lg:col-span-3">
          <FinancialStatusCard
            studentId={student.id}
            activeEnrollmentId={activeEnrollment?.id}
            student={{
              nom: student.nom,
              prenom: student.prenom,
              matricule: student.matricule,
              classe: activeEnrollment?.class.nom ?? "—",
            }}
          />
        </div>

        <Card className="lg:col-span-3">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarDays size={16} className="text-primary" /> Parcours annuel
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="py-2 pr-4">Année</th>
                  <th className="py-2 pr-4">Classe</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Numéro</th>
                  <th className="py-2 pr-4">Statut</th>
                  {canManage && <th className="py-2 pr-4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {student.enrollments.map((en) => (
                  <tr key={en.id} className="border-b border-border">
                    <td className="py-2 pr-4">{en.academicYear.libelle}</td>
                    <td className="py-2 pr-4">{en.class.nom}</td>
                    <td className="py-2 pr-4">{en.type === "INSCRIPTION" ? "Inscription" : "Réinscription"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{en.numero}</td>
                    <td className="py-2 pr-4">
                      <Badge color={ENROLLMENT_STATUS_BADGE[en.statut].color}>
                        {ENROLLMENT_STATUS_BADGE[en.statut].label}
                      </Badge>
                      {en.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">{en.motifAnnulation}</p>}
                    </td>
                    {canManage && (
                      <td className="py-2 pr-4">
                        {en.statut === "ACTIVE" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <ChangeClassAction enrollment={en} onChanged={load} />
                            <Button variant="ghost" onClick={() => void handleCancelEnrollment(en.id)}>
                              Annuler
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {student.enrollments.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="py-6 text-center text-ink-muted">
                      Aucune inscription enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Link href="/eleves" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline">
          <ArrowLeft size={14} /> Retour à la liste des élèves
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Corrige une erreur de saisie sur la classe (même niveau uniquement — voir EnrollmentsService.changeClass). */
function ChangeClassAction({ enrollment, onChanged }: { enrollment: Enrollment; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function startEditing() {
    setError(null);
    setEditing(true);
    const levelId = enrollment.class.levelId;
    if (!levelId) return;
    const data = await api.get<Class[]>(
      `/classes?academicYearId=${enrollment.academicYear.id}&levelId=${levelId}`,
    );
    setClasses(data);
    setSelectedClassId(data.find((c) => c.id !== enrollment.class.id)?.id ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post(`/enrollments/${enrollment.id}/change-class`, { classId: selectedClassId });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="ghost" onClick={() => void startEditing()}>
        <Pencil size={14} /> Classe
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <Select
        value={selectedClassId}
        onChange={(e) => setSelectedClassId(e.target.value)}
        className="w-auto py-1.5 text-xs"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={saving || !selectedClassId}>
        OK
      </Button>
      <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
        ✕
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}
