"use client";

import { API_URL } from "@/lib/api";
import { formatNote, rankLabel, type BulletinData } from "@/lib/grades";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";

function frDate(iso: string | null): string {
  if (!iso) return translate("common.notProvided");
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Le bulletin tel qu'il s'imprime : mêmes informations que le PDF. Le rang et les statistiques de la classe n'y sont que
 * si le serveur les a envoyés (la Direction décide si les parents les voient).
 */
export function BulletinView({ bulletin }: { bulletin: BulletinData }) {
  const { t } = useI18n();
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
        <h3 className="text-base font-bold">{t("bulletin.title", { term: bulletin.trimestre.libelle })}</h3>
        <p className="text-xs text-ink-muted">{t("bulletin.year", { year: bulletin.annee })}</p>
      </div>

      <dl className="mb-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">{t("bulletin.student")} : </dt>
          <dd className="inline">
            {bulletin.eleve.nom} {bulletin.eleve.prenom}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t("bulletin.studentId")} : </dt>
          <dd className="inline">{bulletin.eleve.matricule}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t("bulletin.born")} : </dt>
          <dd className="inline">{frDate(bulletin.eleve.dateNaissance)}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t("bulletin.class")} : </dt>
          <dd className="inline">
            {bulletin.classe.nom} ({bulletin.classe.niveau}, {bulletin.classe.section})
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-primary text-white">
              <th className="border border-border px-2 py-1.5 text-left">{t("bulletin.subject")}</th>
              <th className="border border-border px-2 py-1.5">{t("bulletin.coef")}</th>
              <th className="border border-border px-2 py-1.5 text-right">{t("bulletin.average")}</th>
              {letters && <th className="border border-border px-2 py-1.5">{t("bulletin.letter")}</th>}
              {withStats && (
                <>
                  <th className="border border-border px-2 py-1.5 text-right">{t("bulletin.classAverageShort")}</th>
                  <th className="border border-border px-2 py-1.5 text-right">{t("bulletin.min")}</th>
                  <th className="border border-border px-2 py-1.5 text-right">{t("bulletin.max")}</th>
                </>
              )}
              <th className="border border-border px-2 py-1.5 text-left">{t("bulletin.appreciation")}</th>
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
        <p className="text-base font-bold text-primary">{t("bulletin.overall", { avg: formatNote(bulletin.moyenneGenerale) })}</p>
        <p className="text-sm">
          {[
            bulletin.lettre ? t("bulletin.letterLine", { letter: bulletin.lettre }) : null,
            bulletin.rang !== undefined && bulletin.rang !== null ? t("bulletin.rankLine", { rank: rankLabel(bulletin.rang, bulletin.effectif) }) : null,
            bulletin.moyenneClasse !== undefined && bulletin.moyenneClasse !== null ? t("bulletin.classAverageLine", { avg: formatNote(bulletin.moyenneClasse) }) : null,
            bulletin.admis === null ? null : bulletin.admis ? t("bulletin.admitted") : t("bulletin.notAdmitted"),
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
        {bulletin.appreciationGenerale && (
          <p className="pt-2">
            <span className="font-semibold">{t("bulletin.generalAppreciation")} : </span>
            {bulletin.appreciationGenerale}
          </p>
        )}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-ink-muted">
        <div>
          <div className="h-12 border-b border-dashed border-border" />
          <p className="pt-1">{t("bulletin.signGuardian")}</p>
        </div>
        <div className="text-right">
          <div className="h-12 border-b border-dashed border-border" />
          <p className="pt-1">{t("bulletin.signDirection")}</p>
        </div>
      </div>
    </article>
  );
}
