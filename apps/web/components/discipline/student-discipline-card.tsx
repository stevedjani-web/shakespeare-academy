"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Card, ErrorMessage } from "@/components/ui";
import { ExpandButton } from "@/components/expand";
import { describeError } from "@/components/vie-scolaire/shared";
import {
  GRAVITE_COLOR,
  GRAVITE_LABEL,
  ISSUE_LABEL,
  SANCTION_COLOR,
  SANCTION_LABEL,
  STATUT_COLOR,
  STATUT_LABEL,
  dateTimeLabel,
  dayLabel,
  type ConvocationView,
  type DisciplineRecord,
} from "@/lib/discipline";

interface History {
  signalements: DisciplineRecord[];
  convocations: ConvocationView[];
}

/**
 * Dossier de vie scolaire d'un élève (vie scolaire et Direction). Le contenu est confidentiel : il n'est chargé qu'à
 * l'ouverture de la carte, car chaque lecture est enregistrée dans le journal (RV11).
 */
export function StudentDisciplineCard({ studentId, open, onToggle }: { studentId: string; open: boolean; onToggle: () => void }) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle() {
    onToggle();
    if (!open && !data && !loading) {
      setLoading(true);
      api
        .get<History>(`/discipline/students/${studentId}/history`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((err) => setError(describeError(err)))
        .finally(() => setLoading(false));
    }
  }

  const incidents = data?.signalements.filter((r) => r.nature === "INCIDENT" && r.statut !== "ANNULE").length ?? 0;
  const valorisations = data?.signalements.filter((r) => r.nature === "VALORISATION" && r.statut !== "ANNULE").length ?? 0;

  return (
    <Card className="lg:col-span-3">
      <h2 className={`flex flex-wrap items-center gap-2 text-sm font-semibold text-ink ${open ? "mb-3" : ""}`}>
        <ExpandButton open={open} onClick={toggle} label="la vie scolaire" />
        <ShieldAlert size={16} className="text-primary" /> Vie scolaire (discipline)
        {!open && <span className="font-normal text-ink-muted">Ouvrir pour consulter le dossier</span>}
      </h2>
      {open && (
        <>
          <ErrorMessage>{error}</ErrorMessage>
          {loading && <p className="text-sm text-ink-muted">Chargement…</p>}
          {data && (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <Badge color="red">{incidents} incident(s)</Badge>
                <Badge color="green">{valorisations} valorisation(s)</Badge>
                <Badge color="blue">{data.convocations.length} convocation(s)</Badge>
              </div>
              {data.signalements.length === 0 && data.convocations.length === 0 && (
                <p className="text-sm text-ink-muted">Aucun signalement ni convocation pour cet élève.</p>
              )}
              <ul className="space-y-2 text-sm">
                {data.signalements.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ink">
                        {dayLabel(r.dateFaits)} · {r.type.nom} · {r.classe}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <Badge color={r.nature === "INCIDENT" ? "red" : "green"}>{r.nature === "INCIDENT" ? "Incident" : "Valorisation"}</Badge>
                        {r.gravite && <Badge color={GRAVITE_COLOR[r.gravite]}>{GRAVITE_LABEL[r.gravite]}</Badge>}
                        <Badge color={STATUT_COLOR[r.statut]}>{STATUT_LABEL[r.statut]}</Badge>
                      </span>
                    </div>
                    {r.description && <p className="mt-1 whitespace-pre-line text-ink-muted">{r.description}</p>}
                    <p className="mt-1 text-xs text-ink-muted">Signalé par {r.auteur.prenom} {r.auteur.nom}</p>
                    {r.sanctions.map((s) => (
                      <p key={s.id} className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge color={SANCTION_COLOR[s.statut]}>{SANCTION_LABEL[s.statut]}</Badge>
                        <span className="text-ink">
                          {s.type}, du {dayLabel(s.dateDebut)}
                          {s.dateFin ? ` au ${dayLabel(s.dateFin)}` : ""}
                        </span>
                      </p>
                    ))}
                  </li>
                ))}
                {data.convocations.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                    <span className="text-ink">
                      Convocation du {dateTimeLabel(c.dateRdv)} · {c.lieu}
                    </span>
                    <span className="flex gap-1.5">
                      {c.statut === "ANNULEE" ? <Badge color="gray">Annulée</Badge> : <Badge color={c.accuseLe ? "green" : "orange"}>{c.accuseLe ? "Lue" : "Pas encore lue"}</Badge>}
                      {c.issue && <Badge color={c.issue === "PRESENT" ? "green" : "red"}>{ISSUE_LABEL[c.issue]}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}
