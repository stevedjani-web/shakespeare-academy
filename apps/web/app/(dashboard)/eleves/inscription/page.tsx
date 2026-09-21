"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, isOfflineError } from "@/lib/api";
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
  if (isOfflineError(err)) return "Cette action nécessite une connexion Internet. Réessayez quand elle sera revenue.";
  return isApiError(err) ? err.message : "Une erreur est survenue.";
}

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
  const [queued, setQueued] = useState(false);

  return (
    <div className="max-w-2xl">
      <PageTitle subtitle="Un seul assistant pour la première inscription et la réinscription : le système détermine automatiquement lequel s'applique.">
        Inscription / réinscription
      </PageTitle>

      <Stepper steps={["Élève", "Classe", "Confirmation"]} current={["eleve", "classe", "confirmation"].indexOf(step)} />

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
            Inscription de {student.prenom} {student.nom} enregistrée sur cet appareil. Elle sera envoyée au serveur au retour
            d&apos;Internet ; le numéro d&apos;inscription et la facture seront alors créés.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => router.push("/hors-ligne")}>Voir la synchronisation</Button>
            <Button variant="secondary" onClick={() => router.push("/eleves")}>
              Retour à la liste
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="mt-4">
          <SuccessMessage>
            {result.type === "INSCRIPTION" ? "Inscription" : "Réinscription"} confirmée — numéro {result.numero}.
          </SuccessMessage>
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
      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          onClick={() => setMode("search")}
          className={`px-3 py-2 text-sm font-medium ${mode === "search" ? "border-b-2 border-primary" : "text-ink-muted"}`}
        >
          Élève déjà connu (réinscription)
        </button>
        <button
          onClick={() => setMode("create")}
          className={`px-3 py-2 text-sm font-medium ${mode === "create" ? "border-b-2 border-primary" : "text-ink-muted"}`}
        >
          Nouvel élève
        </button>
      </div>

      {mode === "search" ? (
        <div>
          <Input placeholder="Rechercher un élève…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                    — {s.matricule} · né(e) le {new Date(s.dateNaissance).toLocaleDateString("fr-FR")}
                  </span>
                </button>
              </li>
            ))}
            {query.trim() && results.length === 0 && (
              <li className="py-3 text-sm text-ink-muted">Aucun élève trouvé pour « {query} ».</li>
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
      const res = await submitOrQueue<Student>({
        kind: "student",
        method: "POST",
        path: "/students",
        body: { ...form, forcerCreation },
        label: `${form.prenom} ${form.nom}`,
      });
      if (res.queued) {
        // Élève provisoire : le matricule est attribué par le serveur à la synchronisation.
        onCreated({
          id: refOf(res.entry.id),
          matricule: "Attribué à la synchronisation",
          nom: form.nom,
          prenom: form.prenom,
          sexe: form.sexe as Student["sexe"],
          dateNaissance: form.dateNaissance,
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

      <h3 className="pt-2 text-sm font-semibold text-ink">Responsable légal</h3>
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
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
          <p className="text-warning">
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const body = { studentId: student.id, classId, academicYearId };
      const label = `${student.prenom} ${student.nom} en ${className}`;
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
          <dt className="text-ink-muted">Élève</dt>
          <dd className="font-medium text-ink">
            {student.prenom} {student.nom} <Badge>{student.matricule}</Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Classe</dt>
          <dd className="font-medium text-ink">{className}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-ink-muted">
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
