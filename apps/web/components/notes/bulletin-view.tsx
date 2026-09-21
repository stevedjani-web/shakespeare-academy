"use client";

import { API_URL } from "@/lib/api";
import { formatNote, rankLabel, type BulletinData } from "@/lib/grades";

function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Le bulletin tel qu'il s'imprime : mêmes informations que le PDF. Le rang et les statistiques de la classe n'y sont que
 * si le serveur les a envoyés (la Direction décide si les parents les voient).
 */
export function BulletinView({ bulletin }: { bulletin: BulletinData }) {
  const withStats = bulletin.matieres.some((m) => m.moyenneClasse !== undefined);
  const letters = bulletin.affichageLettres;
  return (
    <article className="rounded-2xl border border-border bg-white p-6 text-sm text-ink print:border-0 print:p-0">
      <header className="flex items-center gap-4 border-b-2 border-primary pb-3">
        {bulletin.ecole.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${API_URL}${bulletin.ecole.logoUrl}`} alt="" className="h-14 w-14 object-contain" />
        )}
        <div>
          <h2 className="text-lg font-bold text-primary">{bulletin.ecole.nom}</h2>
          <p className="text-xs text-ink-muted">{[bulletin.ecole.adresse, bulletin.ecole.telephone].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="my-4 text-center">
        <h3 className="text-base font-bold">Bulletin de notes, {bulletin.trimestre.libelle}</h3>
        <p className="text-xs text-ink-muted">Année scolaire {bulletin.annee}</p>
      </div>

      <dl className="mb-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">Élève : </dt>
          <dd className="inline">
            {bulletin.eleve.nom} {bulletin.eleve.prenom}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Matricule : </dt>
          <dd className="inline">{bulletin.eleve.matricule}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Né(e) le : </dt>
          <dd className="inline">{frDate(bulletin.eleve.dateNaissance)}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Classe : </dt>
          <dd className="inline">
            {bulletin.classe.nom} ({bulletin.classe.niveau}, {bulletin.classe.section})
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-primary text-white">
              <th className="border border-border px-2 py-1.5 text-left">Matière</th>
              <th className="border border-border px-2 py-1.5">Coef.</th>
              <th className="border border-border px-2 py-1.5 text-right">Moyenne /20</th>
              {letters && <th className="border border-border px-2 py-1.5">Lettre</th>}
              {withStats && (
                <>
                  <th className="border border-border px-2 py-1.5 text-right">Classe</th>
                  <th className="border border-border px-2 py-1.5 text-right">Min</th>
                  <th className="border border-border px-2 py-1.5 text-right">Max</th>
                </>
              )}
              <th className="border border-border px-2 py-1.5 text-left">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {bulletin.matieres.map((m) => (
              <tr key={m.nom} className="even:bg-surface-muted">
                <td className="border border-border px-2 py-1.5 font-medium">{m.nom}</td>
                <td className="border border-border px-2 py-1.5 text-center">{m.coefficient}</td>
                <td className="border border-border px-2 py-1.5 text-right tabular-nums">{formatNote(m.moyenne)}</td>
                {letters && <td className="border border-border px-2 py-1.5 text-center">{m.lettre ?? "-"}</td>}
                {withStats && (
                  <>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{formatNote(m.moyenneClasse)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{formatNote(m.min)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{formatNote(m.max)}</td>
                  </>
                )}
                <td className="border border-border px-2 py-1.5">{m.appreciation ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-base font-bold text-primary">Moyenne générale : {formatNote(bulletin.moyenneGenerale)} / 20</p>
        <p className="text-sm">
          {[
            bulletin.lettre ? `Lettre ${bulletin.lettre}` : null,
            bulletin.rang !== undefined && bulletin.rang !== null ? `Rang ${rankLabel(bulletin.rang, bulletin.effectif)}` : null,
            bulletin.moyenneClasse !== undefined && bulletin.moyenneClasse !== null ? `Moyenne de la classe ${formatNote(bulletin.moyenneClasse)}` : null,
            bulletin.admis === null ? null : bulletin.admis ? "Admis" : "Non admis",
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
        {bulletin.appreciationGenerale && (
          <p className="pt-2">
            <span className="font-semibold">Appréciation générale : </span>
            {bulletin.appreciationGenerale}
          </p>
        )}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-ink-muted">
        <div>
          <div className="h-12 border-b border-dashed border-border" />
          <p className="pt-1">Le responsable</p>
        </div>
        <div className="text-right">
          <div className="h-12 border-b border-dashed border-border" />
          <p className="pt-1">La Direction</p>
        </div>
      </div>
    </article>
  );
}
