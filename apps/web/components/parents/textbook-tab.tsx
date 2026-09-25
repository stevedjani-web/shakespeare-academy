"use client";

import { useEffect, useState } from "react";
import { describePortalError, portalApi } from "@/lib/portal-api";
import { frDay, frShort, type ParentTextbook, type ParentTextbookEntry } from "@/lib/textbook";
import { Badge, Card, ErrorMessage, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";

function Homework({ e }: { e: ParentTextbookEntry }) {
  const { t } = useI18n();
  return (
    <li className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{e.matiere}</p>
        {e.dateEcheance && <Badge color="orange">{t("parent.textbook.dueBy", { date: frShort(e.dateEcheance) })}</Badge>}
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-ink">{e.devoirs}</p>
      <p className="mt-1 text-xs text-ink-muted">{t("parent.textbook.givenOn", { date: frShort(e.date), teacher: e.enseignant })}</p>
    </li>
  );
}

/** Le cahier de textes de la classe de l'enfant, en lecture seule : devoirs à rendre d'abord, puis les 14 derniers jours. */
export function ParentTextbookTab({ studentId }: { studentId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ParentTextbook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi
      .get<ParentTextbook>(`/portal/children/${studentId}/textbook`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(describePortalError(e)));
  }, [studentId]);

  // Les entrées du cahier regroupées par jour.
  const byDay = new Map<string, ParentTextbookEntry[]>();
  for (const e of data?.entrees ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="space-y-5">
      <ErrorMessage>{error}</ErrorMessage>
      {!data && !error && <Spinner />}
      {data && !data.classe && <p className="text-sm text-ink-muted">{t("parent.textbook.noClass")}</p>}
      {data?.classe && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t("parent.textbook.dueTitle")}</h3>
            {data.aVenir.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("parent.textbook.noneDue")}</p>
            ) : (
              <ul className="space-y-2">
                {data.aVenir.map((e) => (
                  <Homework key={e.id} e={e} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t("parent.textbook.classLog", { class: data.classe })}</h3>
            {byDay.size === 0 ? (
              <p className="text-sm text-ink-muted">{t("parent.textbook.nothingNoted")}</p>
            ) : (
              <div className="space-y-3">
                {[...byDay.entries()].map(([day, entries]) => (
                  <Card key={day}>
                    <p className="mb-2 text-sm font-semibold text-primary">{frDay(day)}</p>
                    <ul className="space-y-2">
                      {entries.map((e) => (
                        <li key={e.id} className="text-sm text-ink">
                          <p className="font-medium">{e.matiere}</p>
                          {e.contenu && <p className="whitespace-pre-line text-ink-muted">{e.contenu}</p>}
                          {e.devoirs && (
                            <p className="mt-1 whitespace-pre-line">
                              <span className="font-medium">{t("parent.textbook.toDo")}</span>
                              {e.devoirs}
                              {e.dateEcheance && t("parent.textbook.dueParen", { date: frShort(e.dateEcheance) })}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
