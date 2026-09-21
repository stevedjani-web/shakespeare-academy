"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { buildSection, type ExportSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { formatNote, PERIOD_LABEL, rankLabel, type ClassResults, type GradeContext } from "@/lib/grades";
import { Badge, Card, EmptyState, ErrorMessage, Field, Select, Spinner } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

/** Résultats d'une classe pour un trimestre, recalculés à chaque affichage. Un enseignant ne voit que ses matières. */
export function ResultsTab({ context }: { context: GradeContext }) {
  const [termId, setTermId] = useState(context.trimestres[0]?.id ?? "");
  const [classId, setClassId] = useState(context.classes[0]?.id ?? "");
  const [data, setData] = useState<ClassResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!termId || !classId) return;
    setData(null);
    api
      .get<ClassResults>(`/grades/results?classId=${classId}&termId=${termId}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(describeError(err)));
  }, [termId, classId]);

  const sections = useMemo<ExportSection[]>(() => {
    if (!data) return [];
    const columns = [
      { header: "Matricule", value: (e: ClassResults["eleves"][number]) => e.matricule },
      { header: "Nom", value: (e: ClassResults["eleves"][number]) => `${e.nom} ${e.prenom}` },
      ...data.matieres.map((m) => ({
        header: `${m.nom} (coef. ${m.coefficient})`,
        value: (e: ClassResults["eleves"][number]) => formatNote(e.moyennes[m.subjectId]),
      })),
      ...(data.complet
        ? [
            { header: "Moyenne générale", value: (e: ClassResults["eleves"][number]) => formatNote(e.moyenneGenerale) },
            { header: "Rang", value: (e: ClassResults["eleves"][number]) => rankLabel(e.rang) },
          ]
        : []),
    ];
    return [buildSection(`Résultats ${data.classe.nom}`, columns, data.eleves)];
  }, [data]);

  if (context.trimestres.length === 0 || context.classes.length === 0) {
    return <EmptyState title="Rien à afficher" description="Il faut un trimestre et une classe pour afficher des résultats." />;
  }

  const termLabel = context.trimestres.find((t) => t.id === termId)?.libelle ?? "";
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Trimestre">
              <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
                {context.trimestres.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Classe">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                {context.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <ExportButtons
            fileName={`resultats-${data?.classe.nom ?? "classe"}-${termLabel}`}
            title={`Résultats ${data?.classe.nom ?? ""} : ${termLabel}`}
            sections={sections}
            landscape
            disabled={!data || data.eleves.length === 0}
          />
        </div>
        {data && (
          <p className="mt-3 text-sm text-ink-muted">
            <Badge color={data.periode === "OUVERT" ? "blue" : data.periode === "VALIDE" ? "orange" : "green"}>{PERIOD_LABEL[data.periode]}</Badge>{" "}
            Calculé à partir des notes saisies, un absent ou un dispensé n&apos;est jamais compté 0.
            {!data.complet && " Vous ne voyez que vos matières : la moyenne générale et le rang sont réservés à la Direction."}
          </p>
        )}
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {!data && !error && <Spinner className="h-6 w-6 text-primary" />}
      {data && data.matieres.length === 0 && (
        <EmptyState title="Aucune évaluation" description="Aucune évaluation n'a encore été créée pour ce trimestre dans cette classe." />
      )}
      {data && data.matieres.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="sticky left-0 bg-surface px-3 py-2">Élève</th>
                {data.matieres.map((m) => (
                  <th key={m.subjectId} className="px-3 py-2 text-right">
                    {m.nom}
                    <span className="block text-xs font-normal">coef. {m.coefficient}</span>
                  </th>
                ))}
                {data.complet && (
                  <>
                    <th className="px-3 py-2 text-right">Moyenne</th>
                    <th className="px-3 py-2 text-right">Rang</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.eleves.map((e) => (
                <tr key={e.studentId} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="sticky left-0 bg-surface px-3 py-2 font-medium text-ink">
                    {e.nom} {e.prenom}
                  </td>
                  {data.matieres.map((m) => (
                    <td key={m.subjectId} className="px-3 py-2 text-right tabular-nums">
                      {formatNote(e.moyennes[m.subjectId])}
                    </td>
                  ))}
                  {data.complet && (
                    <>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNote(e.moyenneGenerale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rankLabel(e.rang)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-ink-muted">
                <td className="sticky left-0 bg-surface px-3 py-2">Moyenne de la classe</td>
                {data.matieres.map((m) => (
                  <td key={m.subjectId} className="px-3 py-2 text-right tabular-nums">
                    {formatNote(m.stats?.moyenne)}
                  </td>
                ))}
                {data.complet && (
                  <>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNote(data.statsGenerale?.moyenne)}</td>
                    <td />
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
