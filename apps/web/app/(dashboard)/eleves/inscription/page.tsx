"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, isOfflineError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Rich } from "@/lib/i18n/rich";
import { isApiError } from "@/contexts/auth-context";
import { submitOrQueue } from "@/lib/offline-actions";
import { enqueue, processOutbox, refOf } from "@/lib/outbox";
import type { AcademicYear, Class, Cycle, Enrollment, Level, Section, Student } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Select, Stepper, SuccessMessage } from "@/components/ui";

export default function EnrollmentWizardPage() {
  return (
    <Suspense fallback={null}>
      <EnrollmentWizard />
    </Suspense>
  );
}

type Step = "eleve" | "classe" | "confirmation";

const REF_PREFIX = "$ref:";

/** Élève créé sans Internet : son identifiant réel n'existe qu'après la synchronisation. */
function isPendingStudent(s: Student): boolean {
  return s.id.startsWith(REF_PREFIX);
}

function describeError(err: unknown): string {
  if (isOfflineError(err)) return translate("stu.enrol.errOffline");
  return isApiError(err) ? err.message : translate("stu.enrol.errGeneric");
}

function EnrollmentWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const preselectedStudentId = searchParams.get("studentId");

  const [step, setStep] = useState<Step>("eleve");
  const [student, setStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (preselectedStudentId) {
      void api.get<Student>(`/students/${preselectedStudentId}`).then((s) => {
        setStudent(s);
        setStep("classe");
      });
    }
  }, [preselectedStudentId]);

  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [className, setClassName] = useState("");

  const [result, setResult] = useState<Enrollment | null>(null);
  const [queued, setQueued] = useState(false);

  return (
    <div className="max-w-2xl">
      <PageTitle subtitle={t("stu.enrol.subtitle")} helpId="eleves-inscription">
        {t("stu.enrol.title")}
      </PageTitle>

      <Stepper
        steps={[t("stu.enrol.stepStudent"), t("stu.enrol.stepClass"), t("stu.enrol.stepConfirm")]}
        current={["eleve", "classe", "confirmation"].indexOf(step)}
      />

      {step === "eleve" && (
        <StudentStep
          onSelected={(s) => {
            setStudent(s);
            setStep("classe");
          }}
        />
      )}

      {step === "classe" && student && (
        <ClassStep
          onBack={() => setStep("eleve")}
          onSelected={(yearId, cId, cName) => {
            setAcademicYearId(yearId);
            setClassId(cId);
            setClassName(cName);
            setStep("confirmation");
          }}
        />
      )}

      {step === "confirmation" && student && !result && !queued && (
        <ConfirmationStep
          student={student}
          classId={classId}
          className={className}
          academicYearId={academicYearId}
          onBack={() => setStep("classe")}
          onConfirmed={setResult}
          onQueued={() => setQueued(true)}
        />
      )}

      {queued && student && (
        <Card className="mt-4">
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            {t("stu.enrol.queuedMsg", { name: `${student.prenom} ${student.nom}` })}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => router.push("/hors-ligne")}>{t("stu.enrol.seeSync")}</Button>
            <Button variant="secondary" onClick={() => router.push("/eleves")}>
              {t("stu.enrol.backToList")}
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="mt-4">
          <SuccessMessage>
            {t(result.type === "INSCRIPTION" ? "stu.enrol.confirmedEnrolment" : "stu.enrol.confirmedReEnrolment", {
              number: result.numero,
            })}
          </SuccessMessage>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => router.push(`/eleves/${student!.id}`)}>{t("stu.enrol.viewFile")}</Button>
            <Button variant="secondary" onClick={() => router.push("/eleves")}>
              {t("stu.enrol.backToList")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function StudentStep({ onSelected }: { onSelected: (s: Student) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      void api.get<Student[]>(`/students/search?q=${encodeURIComponent(query)}`).then(setResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <Card>
      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          onClick={() => setMode("search")}
          className={`px-3 py-2 text-sm font-medium ${mode === "search" ? "border-b-2 border-primary" : "text-ink-muted"}`}
        >
          {t("stu.enrol.tabKnown")}
        </button>
        <button
          onClick={() => setMode("create")}
          className={`px-3 py-2 text-sm font-medium ${mode === "create" ? "border-b-2 border-primary" : "text-ink-muted"}`}
        >
          {t("stu.enrol.tabNew")}
        </button>
      </div>

      {mode === "search" ? (
        <div>
          <Input placeholder={t("stu.enrol.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="mt-3 divide-y divide-border">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onSelected(s)}
                  className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  <span className="font-medium text-ink">
                    {s.prenom} {s.nom}
                  </span>{" "}
                  <span className="text-ink-muted">
                    {t("stu.enrol.bornOn", { number: s.matricule, date: formatDate(s.dateNaissance) })}
                  </span>
                </button>
              </li>
            ))}
            {query.trim() && results.length === 0 && (
              <li className="py-3 text-sm text-ink-muted">{t("stu.enrol.notFound", { query })}</li>
            )}
          </ul>
        </div>
      ) : (
        <NewStudentForm onCreated={onSelected} />
      )}
    </Card>
  );
}

function NewStudentForm({ onCreated }: { onCreated: (s: Student) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    sexe: "F",
    dateNaissance: "",
    lieuNaissance: "",
    nationalite: "",
    responsable: { nom: "", prenom: "", telephone: "", lien: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; nom: string; prenom: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(forcerCreation: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      // Date de naissance et responsable facultatifs (22 septembre 2026, pour faciliter l'enregistrement) :
      // un champ laissé vide est omis plutôt qu'envoyé en chaîne vide (rejetée par l'API, qui exige soit
      // une vraie valeur, soit rien du tout). Le responsable entier est omis si aucun de ses champs n'est
      // renseigné — aucune fiche vide créée pour rien.
      const r = form.responsable;
      const responsableRempli = r.nom || r.prenom || r.telephone || r.lien;
      const res = await submitOrQueue<Student>({
        kind: "student",
        method: "POST",
        path: "/students",
        body: {
          nom: form.nom,
          prenom: form.prenom,
          sexe: form.sexe,
          dateNaissance: form.dateNaissance || undefined,
          lieuNaissance: form.lieuNaissance.trim() || undefined,
          nationalite: form.nationalite || undefined,
          responsable: responsableRempli
            ? {
                nom: r.nom || undefined,
                prenom: r.prenom || undefined,
                telephone: r.telephone || undefined,
                lien: r.lien || undefined,
              }
            : undefined,
          forcerCreation,
        },
        label: `${form.prenom} ${form.nom}`,
      });
      if (res.queued) {
        // Élève provisoire : le matricule est attribué par le serveur à la synchronisation.
        onCreated({
          id: refOf(res.entry.id),
          matricule: t("stu.enrol.numberOnSync"),
          nom: form.nom,
          prenom: form.prenom,
          sexe: form.sexe as Student["sexe"],
          dateNaissance: form.dateNaissance || null,
          lieuNaissance: form.lieuNaissance.trim() || null,
          nationalite: form.nationalite || null,
          statut: "ACTIF",
        });
      } else {
        onCreated(res.result);
      }
    } catch (err) {
      if (isApiError(err) && err.status === 409 && err.data && typeof err.data === "object" && "doublonPotentiel" in err.data) {
        setDuplicate((err.data as { doublonPotentiel: { id: string; nom: string; prenom: string } }).doublonPotentiel);
        setError(err.message);
      } else {
        setError(describeError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("stu.enrol.fSurname")}>
          <Input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </Field>
        <Field label={t("stu.enrol.fFirstName")}>
          <Input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("stu.enrol.fSex")}>
          <Select value={form.sexe} onChange={(e) => setForm({ ...form, sexe: e.target.value })}>
            <option value="F">{t("stu.sexF")}</option>
            <option value="M">{t("stu.sexM")}</option>
          </Select>
        </Field>
        <Field label={t("stu.enrol.fBirth")}>
          <Input
            type="date"
            value={form.dateNaissance}
            onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t("stu.enrol.fBirthPlace")}>
        <Input value={form.lieuNaissance} onChange={(e) => setForm({ ...form, lieuNaissance: e.target.value })} />
      </Field>
      <Field label={t("stu.enrol.fNationality")}>
        <Input value={form.nationalite} onChange={(e) => setForm({ ...form, nationalite: e.target.value })} />
      </Field>

      <h3 className="pt-2 text-sm font-semibold text-ink">{t("stu.enrol.guardianHeading")}</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("stu.enrol.fSurname")}>
          <Input
            value={form.responsable.nom}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, nom: e.target.value } })}
          />
        </Field>
        <Field label={t("stu.enrol.fFirstName")}>
          <Input
            value={form.responsable.prenom}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, prenom: e.target.value } })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("stu.enrol.fPhone")}>
          <Input
            value={form.responsable.telephone}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, telephone: e.target.value } })}
          />
        </Field>
        <Field label={t("stu.enrol.fRelationship")}>
          <Input
            value={form.responsable.lien}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, lien: e.target.value } })}
          />
        </Field>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {duplicate && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
          <p className="text-warning">
            <Rich text={t("stu.enrol.duplicateWarn", { name: `${duplicate.prenom} ${duplicate.nom}` })} strongClassName="" />
          </p>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => void submit(true)}>
            {t("stu.enrol.notDuplicate")}
          </Button>
        </div>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? t("stu.enrol.creating") : t("stu.enrol.createAndContinue")}
      </Button>
    </form>
  );
}

function ClassStep({
  onSelected,
  onBack,
}: {
  onSelected: (academicYearId: string, classId: string, className: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  const [yearId, setYearId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");

  useEffect(() => {
    void (async () => {
      const [y, s, c, l] = await Promise.all([
        api.get<AcademicYear[]>("/academic-years"),
        api.get<Section[]>("/sections"),
        api.get<Cycle[]>("/cycles"),
        api.get<Level[]>("/levels"),
      ]);
      setYears(y.filter((year) => year.statut !== "CLOTUREE"));
      setSections(s);
      setCycles(c);
      setLevels(l);
      const active = y.find((year) => year.statut === "ACTIVE");
      if (active) setYearId(active.id);
    })();
  }, []);

  useEffect(() => {
    if (!levelId || !yearId) {
      setClasses([]);
      return;
    }
    void api.get<Class[]>(`/classes?levelId=${levelId}&academicYearId=${yearId}`).then(setClasses);
  }, [levelId, yearId]);

  const cyclesForSection = cycles.filter((c) => c.sectionId === sectionId);
  const levelsForCycle = levels.filter((l) => l.cycleId === cycleId);

  return (
    <Card>
      <div className="space-y-4">
        <Field label={t("stu.enrol.fYear")}>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            <option value="">{t("stu.enrol.choose")}</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.libelle} {y.statut === "ACTIVE" ? t("stu.enrol.yearActive") : t("stu.enrol.yearDraft")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stu.enrol.fSection")}>
          <Select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setCycleId("");
              setLevelId("");
            }}
          >
            <option value="">{t("stu.enrol.choose")}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stu.enrol.fCycle")}>
          <Select
            value={cycleId}
            onChange={(e) => {
              setCycleId(e.target.value);
              setLevelId("");
            }}
            disabled={!sectionId}
          >
            <option value="">{t("stu.enrol.choose")}</option>
            {cyclesForSection.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stu.enrol.fLevel")}>
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)} disabled={!cycleId}>
            <option value="">{t("stu.enrol.choose")}</option>
            {levelsForCycle.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stu.enrol.fClass")}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!levelId}>
            <option value="">{t("stu.enrol.choose")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex justify-between pt-2">
          <Button variant="secondary" onClick={onBack}>
            {t("stu.enrol.back")}
          </Button>
          <Button
            disabled={!yearId || !classId}
            onClick={() => onSelected(yearId, classId, classes.find((c) => c.id === classId)?.nom ?? "")}
          >
            {t("stu.enrol.continue")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ConfirmationStep({
  student,
  classId,
  className,
  academicYearId,
  onBack,
  onConfirmed,
  onQueued,
}: {
  student: Student;
  classId: string;
  className: string;
  academicYearId: string;
  onBack: () => void;
  onConfirmed: (e: Enrollment) => void;
  onQueued: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const body = { studentId: student.id, classId, academicYearId };
      const label = t("stu.enrol.labelInClass", { student: `${student.prenom} ${student.nom}`, className });
      if (isPendingStudent(student)) {
        // L'élève lui-même n'existe pas encore côté serveur : l'inscription attend sa création.
        await enqueue({
          kind: "enrollment",
          method: "POST",
          path: "/enrollments",
          body,
          label,
          dependsOn: [student.id.slice(REF_PREFIX.length)],
        });
        void processOutbox();
        onQueued();
      } else {
        const res = await submitOrQueue<Enrollment>({
          kind: "enrollment",
          method: "POST",
          path: "/enrollments",
          body,
          label,
          studentId: student.id,
        });
        if (res.queued) onQueued();
        else onConfirmed(res.result);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("stu.enrol.cStudent")}</dt>
          <dd className="font-medium text-ink">
            {student.prenom} {student.nom} <Badge>{student.matricule}</Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("stu.enrol.cClass")}</dt>
          <dd className="font-medium text-ink">{className}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-ink-muted">
        {t("stu.enrol.notCalculated")}
      </p>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="mt-4 flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          {t("stu.enrol.back")}
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={submitting}>
          {submitting ? t("stu.enrol.confirming") : t("stu.enrol.confirmEnrolment")}
        </Button>
      </div>
    </Card>
  );
}
