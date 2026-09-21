"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AcademicYear, Class, PedagogySummary, Teacher } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Select, Spinner, SuccessMessage } from "@/components/ui";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { describeError, TAB_HINT, WEEK_DAYS } from "./shared";

export type VieScolaireTab = "recap" | "horaires" | "matieres" | "enseignants" | "affectations" | "calendrier" | "salles";

/** Où en est la saisie : ce qui est rempli, ce qui manque, avec un raccourci vers chaque écran. */
export function RecapTab({
  summary,
  years,
  yearId,
  onYearChange,
  onGo,
  onChanged,
}: {
  summary: PedagogySummary | null;
  years: AcademicYear[];
  yearId: string;
  onYearChange: (id: string) => void;
  onGo: (tab: VieScolaireTab) => void;
  onChanged: () => void;
}) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.get<Teacher[]>("/teachers").then((t) => setTeachers(t.filter((x) => x.statut === "ACTIF"))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!yearId) return;
    void api.get<Class[]>(`/classes?academicYearId=${yearId}`).then(setClasses).catch(() => {});
  }, [yearId]);

  useEffect(() => {
    setClassId(summary?.pilote.classe?.id ?? "");
    setTeacherId(summary?.pilote.enseignant?.id ?? "");
  }, [summary]);

  async function savePilot() {
    setError(null);
    setSaved(false);
    try {
      await api.put("/pedagogy/pilot", { classId: classId || null, teacherId: teacherId || null });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (!summary) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
        <Spinner /> Chargement…
      </div>
    );
  }

  const jours = WEEK_DAYS.filter((d) => summary.joursClasse.includes(d.value)).map((d) => d.label.slice(0, 3)).join(", ");
  const nbCreneaux = summary.creneaux.communs + summary.creneaux.parSection;

  const items: Array<{ done: boolean; title: string; detail: string; tab: VieScolaireTab; action: string }> = [
    {
      done: nbCreneaux > 0,
      title: "Jours et horaires",
      detail: `Jours de classe : ${jours}. ${nbCreneaux} créneau(x) saisi(s)${summary.creneaux.parSection > 0 ? `, dont ${summary.creneaux.parSection} propre(s) à une section` : ""}.`,
      tab: "horaires",
      action: "Saisir les horaires",
    },
    {
      done: summary.matieres.total > 0 && summary.matieres.sansNiveau === 0,
      title: "Matières par niveau",
      detail:
        summary.matieres.total === 0
          ? "Aucune matière saisie."
          : `${summary.matieres.total} matière(s)${summary.matieres.sansNiveau > 0 ? `, dont ${summary.matieres.sansNiveau} sans niveau` : ""}.`,
      tab: "matieres",
      action: "Saisir les matières",
    },
    {
      done: summary.enseignants.total > 0,
      title: "Enseignants",
      detail:
        summary.enseignants.total === 0
          ? "Aucun enseignant saisi."
          : `${summary.enseignants.actifs} actif(s) sur ${summary.enseignants.total}${summary.enseignants.sansAffectation > 0 ? `, ${summary.enseignants.sansAffectation} sans affectation` : ""}.`,
      tab: "enseignants",
      action: "Saisir les enseignants",
    },
    {
      done: summary.affectations.requises > 0 && summary.affectations.manquantes === 0,
      title: "Affectations aux classes",
      detail:
        summary.affectations.classes === 0
          ? "Aucune classe pour cette année."
          : summary.affectations.requises === 0
            ? "Aucune matière n'est encore rattachée aux niveaux : rien à affecter."
            : `${summary.affectations.classesCompletes}/${summary.affectations.classes} classe(s) complète(s), ${summary.affectations.manquantes} affectation(s) manquante(s).`,
      tab: "affectations",
      action: "Affecter les enseignants",
    },
    {
      done: summary.trimestres >= 3,
      title: "Trimestres",
      detail: `${summary.trimestres} trimestre(s) saisi(s) sur 3 prévus.`,
      tab: "calendrier",
      action: "Saisir le calendrier",
    },
    {
      done: summary.calendrier.vacances + summary.calendrier.feries > 0,
      title: "Vacances et jours fériés",
      detail: `${summary.calendrier.vacances} période(s) de vacances, ${summary.calendrier.feries} jour(s) férié(s).`,
      tab: "calendrier",
      action: "Saisir le calendrier",
    },
    {
      done: summary.salles > 0,
      title: "Salles",
      detail: summary.salles === 0 ? "Aucune salle saisie." : `${summary.salles} salle(s).`,
      tab: "salles",
      action: "Saisir les salles",
    },
    {
      done: !!summary.pilote.classe && !!summary.pilote.enseignant,
      title: "Classe pilote et enseignant volontaire",
      detail: `Classe : ${summary.pilote.classe?.nom ?? "non choisie"}. Enseignant : ${
        summary.pilote.enseignant ? `${summary.pilote.enseignant.prenom} ${summary.pilote.enseignant.nom}` : "non choisi"
      }.`,
      tab: "recap",
      action: "Choisir ci-dessous",
    },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Où en est la saisie ?</h2>
            <p className={TAB_HINT}>
              {doneCount}/{items.length} rubriques complètes. Les affectations et le calendrier dépendent de l&apos;année scolaire choisie.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <Select value={yearId} onChange={(e) => onYearChange(e.target.value)} aria-label="Année scolaire">
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.libelle}
                  {y.statut === "ACTIVE" ? " (active)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.title}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-border p-3 ${
                item.done ? "border-l-success bg-success-soft/30" : "border-l-warning bg-warning-soft/30"
              }`}
            >
              <div className="flex items-start gap-3">
                {item.done ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" /> : <Circle size={20} className="mt-0.5 shrink-0 text-warning" />}
                <div>
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="text-sm text-ink-muted">{item.detail}</p>
                </div>
              </div>
              {item.tab !== "recap" && (
                <Button variant={item.done ? "secondary" : "primary"} onClick={() => onGo(item.tab)}>
                  {item.done ? "Modifier" : item.action}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Classe pilote et enseignant volontaire</h3>
        <p className={`mb-3 ${TAB_HINT}`}>
          Une seule classe et un seul enseignant : ils testeront en premier l&apos;appel et le pointage. Choisir une nouvelle classe retire la précédente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Classe pilote">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Aucune</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Enseignant volontaire">
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Aucun</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.prenom} {t.nom}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <SuccessMessage>{saved ? "Désignation enregistrée." : null}</SuccessMessage>
        <Button className="mt-3" onClick={() => void savePilot()}>
          Enregistrer
        </Button>
      </Card>

      <Card>
        <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold text-ink">
          <FileText size={16} className="text-primary" /> À transmettre en document
        </h3>
        <p className="text-sm text-ink-muted">
          Ces deux éléments ne se saisissent pas dans l&apos;application : merci de les remettre à l&apos;équipe de développement.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-ink">
          <li>
            <Badge color="slate">Document</Badge> Le règlement intérieur actuel sur les retards et les absences.
          </li>
          <li>
            <Badge color="slate">Document</Badge> Le modèle de justificatif d&apos;absence utilisé aujourd&apos;hui.
          </li>
        </ul>
      </Card>
    </div>
  );
}
