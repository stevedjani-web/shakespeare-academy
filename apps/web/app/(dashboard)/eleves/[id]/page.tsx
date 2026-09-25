"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, isOfflineError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { translate, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { isApiError, useAuth } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { useOnOutboxChange } from "@/lib/outbox";
import { ExpandButton, useExpanded } from "@/components/expand";
import type { Class, Enrollment, FinancialStatus, School, Student, StudentAttendanceHistory, StudentDossier } from "@/lib/types";
import type { StudentBulletinRow } from "@/lib/grades";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import { FinancialStatusCard } from "@/components/financial-status-card";
import { AttendanceHistoryCard } from "@/components/attendance-history-card";
import { StudentDocumentsCard } from "@/components/documents/student-documents-card";
import { StudentPhoto } from "@/components/documents/student-photo";
import { StudentDisciplineCard } from "@/components/discipline/student-discipline-card";
import { StudentGradesCard } from "@/components/notes/student-grades-card";
import { StudentSummaryStrip } from "@/components/student-summary-strip";
import { downloadStudentSummaryPdf } from "@/lib/student-summary-pdf";
import { ArrowLeft, CalendarDays, Download, IdCard, Pencil, UserPlus, Users } from "lucide-react";

function sexLabel(sexe: string): string {
  return translate(sexe === "M" ? "stu.sexM" : "stu.sexF");
}

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("stu.doss.errOffline");
  return isApiError(err) ? err.message : translate("stu.doss.errGeneric");
}
const ENROLLMENT_STATUS_BADGE: Record<string, { label: MessageKey; color: "green" | "gray" }> = {
  ACTIVE: { label: "stu.doss.enrActive", color: "green" },
  ANNULEE: { label: "stu.doss.enrCancelled", color: "gray" },
};

export default function StudentDossierPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("ENROLLMENT_MANAGE");
  const { t } = useI18n();

  const [student, setStudent] = useState<StudentDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardianForm, setGuardianForm] = useState({ nom: "", prenom: "", telephone: "", lien: "" });
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({ nom: "", prenom: "", sexe: "M", dateNaissance: "", lieuNaissance: "", nationalite: "" });
  const [studentError, setStudentError] = useState<string | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  // Situation financière ouverte au départ : c'est là que se fait l'encaissement.
  const expand = useExpanded(["finance"]);

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
      // Tous facultatifs (22 septembre 2026) : un champ vide est omis plutôt qu'envoyé en chaîne vide
      // (rejetée par l'API, qui exige soit une vraie valeur, soit rien du tout).
      const res = await submitOrQueue({
        kind: "guardian",
        method: "POST",
        path: `/students/${params.id}/guardians`,
        body: {
          nom: guardianForm.nom || undefined,
          prenom: guardianForm.prenom || undefined,
          telephone: guardianForm.telephone || undefined,
          lien: guardianForm.lien || undefined,
        },
        label: t("stu.doss.guardianFor", {
          guardian: `${guardianForm.prenom} ${guardianForm.nom}${guardianForm.lien ? ` (${guardianForm.lien})` : ""}`,
          student: `${student?.prenom ?? ""} ${student?.nom ?? ""}`,
        }).trim(),
        studentId: params.id,
      });
      setGuardianForm({ nom: "", prenom: "", telephone: "", lien: "" });
      setShowGuardianForm(false);
      if (res.queued) setNotice(t("stu.doss.guardianQueued"));
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function handleDetachGuardian(guardianId: string) {
    if (!confirm(t("stu.doss.confirmDetach"))) return;
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
      dateNaissance: student.dateNaissance?.slice(0, 10) ?? "",
      lieuNaissance: student.lieuNaissance ?? "",
      nationalite: student.nationalite ?? "",
    });
    setStudentError(null);
    setEditingStudent(true);
    if (!expand.isOpen("identite")) expand.toggle("identite");
  }

  async function handleSaveStudent(e: React.FormEvent) {
    e.preventDefault();
    setStudentError(null);
    setSavingStudent(true);
    try {
      // Date de naissance facultative (22 septembre 2026) : une valeur vide est omise plutôt qu'envoyée
      // telle quelle (une chaîne vide n'est pas une date valide, rejetée par l'API).
      const res = await submitOrQueue({
        kind: "student-update",
        method: "PATCH",
        path: `/students/${params.id}`,
        body: { ...studentForm, dateNaissance: studentForm.dateNaissance || undefined },
        label: t("stu.doss.correctionOf", { name: `${studentForm.prenom} ${studentForm.nom}` }),
        studentId: params.id,
      });
      setEditingStudent(false);
      if (res.queued) {
        setNotice(t("stu.doss.correctionQueued"));
        // Affichage immédiat de ce qui a été saisi ; le serveur reste la référence à la synchronisation.
        setStudent((s) =>
          s
            ? {
                ...s,
                ...studentForm,
                sexe: studentForm.sexe as Student["sexe"],
                dateNaissance: studentForm.dateNaissance || s.dateNaissance,
                lieuNaissance: studentForm.lieuNaissance || null,
                nationalite: studentForm.nationalite || null,
              }
            : s,
        );
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
    const motif = prompt(t("stu.doss.promptCancel"));
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

  // Fiche de synthèse (PDF) : toujours des données fraîches au moment du clic, jamais celles déjà
  // affichées à l'écran (qui peuvent être périmées). La discipline en est volontairement absente
  // (voir student-summary-pdf.ts) : jamais une lecture forcée du dossier de vie scolaire en silence.
  async function handleDownloadSummary() {
    if (!student) return;
    setDownloadingSummary(true);
    try {
      const activeEnr = student.enrollments.find((e) => e.statut === "ACTIVE");
      const [ecole, finance, assiduite, bulletins] = await Promise.all([
        api.get<School>("/school"),
        hasPermission("FINANCE_READ")
          ? api.get<FinancialStatus>(`/students/${student.id}/financial-status`).catch(() => null)
          : Promise.resolve(null),
        hasPermission("ATTENDANCE_READ")
          ? api.get<StudentAttendanceHistory>(`/attendance/students/${student.id}/history`).catch(() => null)
          : Promise.resolve(null),
        hasPermission("GRADE_READ")
          ? api.get<StudentBulletinRow[]>(`/students/${student.id}/bulletins`).catch(() => null)
          : Promise.resolve(null),
      ]);
      await downloadStudentSummaryPdf({
        ecole: { nom: ecole.nom, adresse: ecole.adresse, telephone: ecole.telephone, logoUrl: ecole.logoUrl },
        eleve: {
          nom: student.nom,
          prenom: student.prenom,
          matricule: student.matricule,
          sexe: student.sexe,
          dateNaissance: student.dateNaissance,
          lieuNaissance: student.lieuNaissance ?? null,
          nationalite: student.nationalite ?? null,
        },
        classe: activeEnr?.class.nom ?? null,
        responsables: student.studentGuardians.map((sg) => ({
          nom: sg.guardian.nom,
          prenom: sg.guardian.prenom,
          telephone: sg.guardian.telephone,
          lien: sg.lien,
        })),
        finance,
        assiduite,
        bulletins,
        editePar: user ? `${user.prenom} ${user.nom}` : t("stu.doss.staffFallback"),
      });
    } catch (err) {
      alert(describeError(err));
    } finally {
      setDownloadingSummary(false);
    }
  }

  if (!student) return null;

  const activeEnrollment = student.enrollments.find((e) => e.statut === "ACTIVE");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <StudentPhoto
            studentId={student.id}
            photoRef={student.photoUrl ?? null}
            initials={`${student.prenom.charAt(0)}${student.nom.charAt(0)}`.toUpperCase()}
            canEdit={canManage}
            onChanged={() => void load().catch(() => {})}
          />
          <PageTitle subtitle={t("stu.doss.subtitle", { number: student.matricule })} helpId="eleves-dossier">
            {student.prenom} {student.nom}
          </PageTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void handleDownloadSummary()} disabled={downloadingSummary}>
            <Download size={15} /> {downloadingSummary ? t("stu.doss.generating") : t("stu.doss.summaryPdf")}
          </Button>
          {canManage && (
            <Button onClick={() => router.push(`/eleves/inscription?studentId=${student.id}`)}>
              {t("stu.doss.enrolNewYear")}
            </Button>
          )}
        </div>
      </div>

      {notice && <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{notice}</p>}

      <StudentSummaryStrip studentId={student.id} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <div className={`flex flex-wrap items-center justify-between gap-2 ${expand.isOpen("identite") ? "mb-3" : ""}`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ExpandButton open={expand.isOpen("identite")} onClick={() => expand.toggle("identite")} label={t("stu.doss.identityLabel")} />
              <IdCard size={16} className="text-primary" /> {t("stu.doss.identity")}
              {!expand.isOpen("identite") && (
                <span className="font-normal text-ink-muted">
                  {t("stu.doss.bornOn", { sex: sexLabel(student.sexe), date: formatDate(student.dateNaissance) })}
                </span>
              )}
            </h2>
            {canManage && !editingStudent && (
              <Button variant="ghost" onClick={startEditStudent}>
                <Pencil size={14} /> {t("stu.doss.edit")}
              </Button>
            )}
          </div>
          {(expand.isOpen("identite") || editingStudent) && (editingStudent ? (
            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("stu.doss.fSurname")}>
                  <Input
                    required
                    value={studentForm.nom}
                    onChange={(e) => setStudentForm({ ...studentForm, nom: e.target.value })}
                  />
                </Field>
                <Field label={t("stu.doss.fFirstName")}>
                  <Input
                    required
                    value={studentForm.prenom}
                    onChange={(e) => setStudentForm({ ...studentForm, prenom: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("stu.doss.fSex")}>
                  <Select
                    value={studentForm.sexe}
                    onChange={(e) => setStudentForm({ ...studentForm, sexe: e.target.value })}
                  >
                    <option value="M">{t("stu.sexM")}</option>
                    <option value="F">{t("stu.sexF")}</option>
                  </Select>
                </Field>
                <Field label={t("stu.doss.fBirth")}>
                  <Input
                    type="date"
                    value={studentForm.dateNaissance}
                    onChange={(e) => setStudentForm({ ...studentForm, dateNaissance: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={t("stu.doss.fBirthPlace")}>
                <Input
                  value={studentForm.lieuNaissance}
                  onChange={(e) => setStudentForm({ ...studentForm, lieuNaissance: e.target.value })}
                />
              </Field>
              <Field label={t("stu.doss.fNationality")}>
                <Input
                  value={studentForm.nationalite}
                  onChange={(e) => setStudentForm({ ...studentForm, nationalite: e.target.value })}
                />
              </Field>
              <ErrorMessage>{studentError}</ErrorMessage>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingStudent}>
                  {savingStudent ? t("stu.doss.saving") : t("stu.doss.save")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditingStudent(false)}>
                  {t("stu.doss.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <dl className="space-y-2 text-sm">
              <Row label={t("stu.doss.fSex")} value={sexLabel(student.sexe)} />
              <Row label={t("stu.doss.rBirth")} value={formatDate(student.dateNaissance)} />
              <Row label={t("stu.doss.rBirthPlace")} value={student.lieuNaissance ?? "—"} />
              <Row label={t("stu.doss.fNationality")} value={student.nationalite ?? "—"} />
              <Row
                label={t("stu.doss.rStatus")}
                value={
                  <Badge color={student.statut === "ACTIF" ? "green" : "gray"}>
                    {student.statut === "ACTIF" ? t("stu.doss.stActif") : t("stu.doss.stInactif")}
                  </Badge>
                }
              />
            </dl>
          ))}
        </Card>

        <Card className="lg:col-span-2">
          <div className={`flex flex-wrap items-center justify-between gap-2 ${expand.isOpen("resp") || showGuardianForm ? "mb-3" : ""}`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ExpandButton open={expand.isOpen("resp")} onClick={() => expand.toggle("resp")} label={t("stu.doss.guardiansLabel")} />
              <Users size={16} className="text-primary" /> {t("stu.doss.guardians")}
              {!expand.isOpen("resp") && (
                <span className="font-normal text-ink-muted">{t("stu.doss.guardianCount", { count: student.studentGuardians.length })}</span>
              )}
            </h2>
            {canManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!showGuardianForm && !expand.isOpen("resp")) expand.toggle("resp");
                  setShowGuardianForm((v) => !v);
                }}
              >
                <UserPlus size={15} />
                {showGuardianForm ? t("stu.doss.cancel") : t("stu.doss.add")}
              </Button>
            )}
          </div>
          {(expand.isOpen("resp") || showGuardianForm) && (
          <ul className="divide-y divide-border">
            {student.studentGuardians.map((sg) => (
              <li key={sg.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-ink">
                    {sg.guardian.prenom || sg.guardian.nom ? `${sg.guardian.prenom ?? ""} ${sg.guardian.nom ?? ""}`.trim() : t("stu.doss.unnamedGuardian")}
                  </span>{" "}
                  <span className="text-ink-muted">
                    {t("stu.doss.guardianMeta", {
                      link: sg.lien ?? t("stu.doss.linkUnspecified"),
                      phone: sg.guardian.telephone ?? t("stu.doss.phoneMissing"),
                    })}
                  </span>
                  {sg.prioritaire && (
                    <span className="ml-2">
                      <Badge color="blue">{t("stu.doss.priorityContact")}</Badge>
                    </span>
                  )}
                </div>
                {canManage && (
                  <Button variant="ghost" onClick={() => void handleDetachGuardian(sg.guardianId)}>
                    {t("stu.doss.detach")}
                  </Button>
                )}
              </li>
            ))}
            {student.studentGuardians.length === 0 && (
              <li className="py-4 text-sm text-ink-muted">{t("stu.doss.noGuardian")}</li>
            )}
          </ul>
          )}
          {showGuardianForm && (
            <form onSubmit={handleAttachGuardian} className="mt-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs text-ink-muted">{t("stu.doss.guardianOptional")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("stu.doss.fSurname")}>
                  <Input
                    value={guardianForm.nom}
                    onChange={(e) => setGuardianForm({ ...guardianForm, nom: e.target.value })}
                  />
                </Field>
                <Field label={t("stu.doss.fFirstName")}>
                  <Input
                    value={guardianForm.prenom}
                    onChange={(e) => setGuardianForm({ ...guardianForm, prenom: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("stu.doss.fPhone")}>
                  <Input
                    value={guardianForm.telephone}
                    onChange={(e) => setGuardianForm({ ...guardianForm, telephone: e.target.value })}
                  />
                </Field>
                <Field label={t("stu.doss.fRelationship")}>
                  <Input
                    value={guardianForm.lien}
                    onChange={(e) => setGuardianForm({ ...guardianForm, lien: e.target.value })}
                  />
                </Field>
              </div>
              <ErrorMessage>{error}</ErrorMessage>
              <Button type="submit">{t("stu.doss.attach")}</Button>
            </form>
          )}
        </Card>

        {hasPermission("FINANCE_READ") && (
        <div className="lg:col-span-3">
          <FinancialStatusCard
            open={expand.isOpen("finance")}
            onToggle={() => expand.toggle("finance")}
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
        )}

        {hasPermission("DOCUMENT_ISSUE") && (
          <StudentDocumentsCard
            studentId={student.id}
            hasPhoto={Boolean(student.photoUrl)}
            open={expand.isOpen("documents")}
            onToggle={() => expand.toggle("documents")}
          />
        )}

        {hasPermission("GRADE_READ") && <StudentGradesCard studentId={student.id} />}

        <Card className="lg:col-span-3">
          <h2 className={`flex items-center gap-2 text-sm font-semibold text-ink ${expand.isOpen("parcours") ? "mb-3" : ""}`}>
            <ExpandButton open={expand.isOpen("parcours")} onClick={() => expand.toggle("parcours")} label={t("stu.doss.annualLabel")} />
            <CalendarDays size={16} className="text-primary" /> {t("stu.doss.annual")}
            {!expand.isOpen("parcours") && (
              <span className="font-normal text-ink-muted">{t("stu.doss.enrolmentCount", { count: student.enrollments.length })}</span>
            )}
          </h2>
          {expand.isOpen("parcours") && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="py-2 pr-4">{t("stu.doss.cYear")}</th>
                  <th className="py-2 pr-4">{t("stu.doss.cClass")}</th>
                  <th className="py-2 pr-4">{t("stu.doss.cType")}</th>
                  <th className="py-2 pr-4">{t("stu.doss.cNumber")}</th>
                  <th className="py-2 pr-4">{t("stu.doss.cStatus")}</th>
                  {canManage && <th className="py-2 pr-4">{t("stu.doss.cActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {student.enrollments.map((en) => (
                  <tr key={en.id} className="border-b border-border">
                    <td className="py-2 pr-4">{en.academicYear.libelle}</td>
                    <td className="py-2 pr-4">{en.class.nom}</td>
                    <td className="py-2 pr-4">{en.type === "INSCRIPTION" ? t("stu.doss.typeEnrolment") : t("stu.doss.typeReEnrolment")}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{en.numero}</td>
                    <td className="py-2 pr-4">
                      <Badge color={ENROLLMENT_STATUS_BADGE[en.statut].color}>
                        {t(ENROLLMENT_STATUS_BADGE[en.statut].label)}
                      </Badge>
                      {en.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">{en.motifAnnulation}</p>}
                    </td>
                    {canManage && (
                      <td className="py-2 pr-4">
                        {en.statut === "ACTIVE" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <ChangeClassAction enrollment={en} onChanged={load} />
                            <Button variant="ghost" onClick={() => void handleCancelEnrollment(en.id)}>
                              {t("stu.doss.cancel")}
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
                      {t("stu.doss.noEnrolment")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </Card>

        {hasPermission("ATTENDANCE_READ") && <AttendanceHistoryCard studentId={student.id} />}
        {(hasPermission("DISCIPLINE_READ") || hasPermission("DISCIPLINE_DECIDE")) && (
          <StudentDisciplineCard studentId={student.id} open={expand.isOpen("discipline")} onToggle={() => expand.toggle("discipline")} />
        )}
      </div>

      <div className="mt-4">
        <Link href="/eleves" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink hover:underline">
          <ArrowLeft size={14} /> {t("stu.doss.backToList")}
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
  const { t } = useI18n();
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
      setError(isApiError(err) ? err.message : t("stu.doss.errGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="ghost" onClick={() => void startEditing()}>
        <Pencil size={14} /> {t("stu.doss.cClass")}
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
