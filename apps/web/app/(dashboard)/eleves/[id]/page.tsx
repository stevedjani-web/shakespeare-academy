"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { StudentDossier } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle } from "@/components/ui";

const SEXE_LABEL: Record<string, string> = { M: "Masculin", F: "Féminin" };
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

  async function load() {
    const data = await api.get<StudentDossier>(`/students/${params.id}`);
    setStudent(data);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleAttachGuardian(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/students/${params.id}/guardians`, guardianForm);
      setGuardianForm({ nom: "", prenom: "", telephone: "", lien: "" });
      setShowGuardianForm(false);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  async function handleDetachGuardian(guardianId: string) {
    if (!confirm("Détacher ce responsable de l'élève ?")) return;
    await api.delete(`/students/${params.id}/guardians/${guardianId}`);
    await load();
  }

  async function handleCancelEnrollment(enrollmentId: string) {
    const motif = prompt("Motif de l'annulation (obligatoire) :");
    if (!motif) return;
    try {
      await api.post(`/enrollments/${enrollmentId}/cancel`, { motif });
      await load();
    } catch (err) {
      alert(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  if (!student) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageTitle subtitle={`Matricule ${student.matricule}`}>
          {student.prenom} {student.nom}
        </PageTitle>
        {canManage && (
          <Button onClick={() => router.push(`/eleves/inscription?studentId=${student.id}`)}>
            Inscrire pour une nouvelle année
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Identité</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Sexe" value={SEXE_LABEL[student.sexe]} />
            <Row label="Date de naissance" value={new Date(student.dateNaissance).toLocaleDateString("fr-FR")} />
            <Row label="Nationalité" value={student.nationalite ?? "—"} />
            <Row
              label="Statut"
              value={<Badge color={student.statut === "ACTIF" ? "green" : "gray"}>{student.statut}</Badge>}
            />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Responsables</h2>
            {canManage && (
              <Button variant="secondary" onClick={() => setShowGuardianForm((v) => !v)}>
                {showGuardianForm ? "Annuler" : "Ajouter un responsable"}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {student.studentGuardians.map((sg) => (
              <li key={sg.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-900">
                    {sg.guardian.prenom} {sg.guardian.nom}
                  </span>{" "}
                  <span className="text-slate-500">
                    — {sg.lien} · {sg.guardian.telephone}
                  </span>
                  {sg.prioritaire && <Badge color="blue">Contact prioritaire</Badge>}
                </div>
                {canManage && (
                  <Button variant="ghost" onClick={() => void handleDetachGuardian(sg.guardianId)}>
                    Détacher
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {showGuardianForm && (
            <form onSubmit={handleAttachGuardian} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
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

        <Card className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Parcours annuel</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
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
                  <tr key={en.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{en.academicYear.libelle}</td>
                    <td className="py-2 pr-4">{en.class.nom}</td>
                    <td className="py-2 pr-4">{en.type === "INSCRIPTION" ? "Inscription" : "Réinscription"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{en.numero}</td>
                    <td className="py-2 pr-4">
                      <Badge color={ENROLLMENT_STATUS_BADGE[en.statut].color}>
                        {ENROLLMENT_STATUS_BADGE[en.statut].label}
                      </Badge>
                      {en.motifAnnulation && <p className="mt-1 text-xs text-slate-400">{en.motifAnnulation}</p>}
                    </td>
                    {canManage && (
                      <td className="py-2 pr-4">
                        {en.statut === "ACTIVE" && (
                          <Button variant="ghost" onClick={() => void handleCancelEnrollment(en.id)}>
                            Annuler
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {student.enrollments.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="py-6 text-center text-slate-400">
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
        <Link href="/eleves" className="text-sm text-slate-500 hover:underline">
          ← Retour à la liste des élèves
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
