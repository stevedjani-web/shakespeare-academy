"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import type { AcademicYear, Class, Cycle, Enrollment, Level, Section, Student } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";

export default function EnrollmentWizardPage() {
  return (
    <Suspense fallback={null}>
      <EnrollmentWizard />
    </Suspense>
  );
}

type Step = "eleve" | "classe" | "confirmation";

function EnrollmentWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  return (
    <div className="max-w-2xl">
      <PageTitle subtitle="Un seul assistant pour la première inscription et la réinscription : le système détermine automatiquement lequel s'applique.">
        Inscription / réinscription
      </PageTitle>

      <Steps current={step} />

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

      {step === "confirmation" && student && !result && (
        <ConfirmationStep
          student={student}
          classId={classId}
          className={className}
          academicYearId={academicYearId}
          onBack={() => setStep("classe")}
          onConfirmed={setResult}
        />
      )}

      {result && (
        <Card className="mt-4">
          <p className="text-sm font-medium text-green-700">
            {result.type === "INSCRIPTION" ? "Inscription" : "Réinscription"} confirmée — numéro {result.numero}.
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => router.push(`/eleves/${student!.id}`)}>Voir le dossier de l&apos;élève</Button>
            <Button variant="secondary" onClick={() => router.push("/eleves")}>
              Retour à la liste
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "eleve", label: "1. Élève" },
    { key: "classe", label: "2. Classe" },
    { key: "confirmation", label: "3. Confirmation" },
  ];
  return (
    <div className="mb-6 flex gap-2">
      {steps.map((s) => (
        <span
          key={s.key}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            s.key === current ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function StudentStep({ onSelected }: { onSelected: (s: Student) => void }) {
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
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setMode("search")}
          className={`px-3 py-2 text-sm font-medium ${mode === "search" ? "border-b-2 border-slate-900" : "text-slate-500"}`}
        >
          Élève déjà connu (réinscription)
        </button>
        <button
          onClick={() => setMode("create")}
          className={`px-3 py-2 text-sm font-medium ${mode === "create" ? "border-b-2 border-slate-900" : "text-slate-500"}`}
        >
          Nouvel élève
        </button>
      </div>

      {mode === "search" ? (
        <div>
          <Input placeholder="Rechercher un élève…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="mt-3 divide-y divide-slate-100">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onSelected(s)}
                  className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">
                    {s.prenom} {s.nom}
                  </span>{" "}
                  <span className="text-slate-400">
                    — {s.matricule} · né(e) le {new Date(s.dateNaissance).toLocaleDateString("fr-FR")}
                  </span>
                </button>
              </li>
            ))}
            {query.trim() && results.length === 0 && (
              <li className="py-3 text-sm text-slate-400">Aucun élève trouvé pour « {query} ».</li>
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
  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    sexe: "F",
    dateNaissance: "",
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
      const created = await api.post<Student>("/students", { ...form, forcerCreation });
      onCreated(created);
    } catch (err) {
      if (isApiError(err) && err.status === 409 && err.data && typeof err.data === "object" && "doublonPotentiel" in err.data) {
        setDuplicate((err.data as { doublonPotentiel: { id: string; nom: string; prenom: string } }).doublonPotentiel);
        setError(err.message);
      } else {
        setError(isApiError(err) ? err.message : "Une erreur est survenue.");
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
        <Field label="Nom">
          <Input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </Field>
        <Field label="Prénom">
          <Input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Sexe">
          <Select value={form.sexe} onChange={(e) => setForm({ ...form, sexe: e.target.value })}>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
          </Select>
        </Field>
        <Field label="Date de naissance">
          <Input
            type="date"
            required
            value={form.dateNaissance}
            onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Nationalité (facultatif)">
        <Input value={form.nationalite} onChange={(e) => setForm({ ...form, nationalite: e.target.value })} />
      </Field>

      <h3 className="pt-2 text-sm font-semibold text-slate-900">Responsable légal</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom">
          <Input
            required
            value={form.responsable.nom}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, nom: e.target.value } })}
          />
        </Field>
        <Field label="Prénom">
          <Input
            required
            value={form.responsable.prenom}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, prenom: e.target.value } })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Téléphone">
          <Input
            required
            value={form.responsable.telephone}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, telephone: e.target.value } })}
          />
        </Field>
        <Field label="Lien (Père, Mère, Tuteur…)">
          <Input
            required
            value={form.responsable.lien}
            onChange={(e) => setForm({ ...form, responsable: { ...form.responsable, lien: e.target.value } })}
          />
        </Field>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {duplicate && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
          <p className="text-orange-800">
            Élève potentiellement déjà connu : <strong>{duplicate.prenom} {duplicate.nom}</strong>.
          </p>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => void submit(true)}>
            Ce n&apos;est pas un doublon, créer quand même
          </Button>
        </div>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Création…" : "Créer l'élève et continuer"}
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
        <Field label="Année scolaire">
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            <option value="">— Choisir —</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.libelle} {y.statut === "ACTIVE" ? "(active)" : "(brouillon)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section">
          <Select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setCycleId("");
              setLevelId("");
            }}
          >
            <option value="">— Choisir —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cycle">
          <Select
            value={cycleId}
            onChange={(e) => {
              setCycleId(e.target.value);
              setLevelId("");
            }}
            disabled={!sectionId}
          >
            <option value="">— Choisir —</option>
            {cyclesForSection.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Niveau">
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)} disabled={!cycleId}>
            <option value="">— Choisir —</option>
            {levelsForCycle.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Classe">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!levelId}>
            <option value="">— Choisir —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex justify-between pt-2">
          <Button variant="secondary" onClick={onBack}>
            Retour
          </Button>
          <Button
            disabled={!yearId || !classId}
            onClick={() => onSelected(yearId, classId, classes.find((c) => c.id === classId)?.nom ?? "")}
          >
            Continuer
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
}: {
  student: Student;
  classId: string;
  className: string;
  academicYearId: string;
  onBack: () => void;
  onConfirmed: (e: Enrollment) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const enrollment = await api.post<Enrollment>("/enrollments", {
        studentId: student.id,
        classId,
        academicYearId,
      });
      onConfirmed(enrollment);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Élève</dt>
          <dd className="font-medium text-slate-900">
            {student.prenom} {student.nom} <Badge>{student.matricule}</Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Classe</dt>
          <dd className="font-medium text-slate-900">{className}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-slate-500">
        Le total des frais applicables, les échéances et la solvabilité ne sont pas encore calculés à ce stade
        (Lot 3). Cette action crée uniquement l&apos;inscription administrative.
      </p>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="mt-4 flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          Retour
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={submitting}>
          {submitting ? "Confirmation…" : "Confirmer l'inscription"}
        </Button>
      </div>
    </Card>
  );
}
