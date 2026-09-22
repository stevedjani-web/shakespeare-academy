"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import {
  GRAVITE_COLOR,
  GRAVITE_LABEL,
  SANCTION_COLOR,
  SANCTION_LABEL,
  STATUT_COLOR,
  STATUT_LABEL,
  dayLabel,
  studentName,
  type DisciplineGravite,
  type DisciplineNature,
  type DisciplineRecord,
  type DisciplineRecordStatus,
  type SanctionType,
} from "@/lib/discipline";

function SanctionForm({ recordId, onDone, onCancel }: { recordId: string; onDone: () => void; onCancel: () => void }) {
  const [types, setTypes] = useState<SanctionType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<SanctionType[]>("/discipline/sanction-types").then(setTypes).catch(() => setTypes([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/discipline/records/${recordId}/sanctions`, {
        typeId,
        dateDebut,
        ...(dateFin ? { dateFin } : {}),
        ...(message.trim() ? { messageFamille: message } : {}),
      });
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  const active = types.filter((t) => t.actif);
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-border bg-surface-muted p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Sanction">
          <Select required value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Choisir…</option>
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Début">
          <Input type="date" required value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </Field>
        <Field label="Fin (facultatif)">
          <Input type="date" value={dateFin} min={dateDebut} onChange={(e) => setDateFin(e.target.value)} />
        </Field>
      </div>
      {active.length === 0 && <p className="text-xs text-ink-muted">Aucun type de sanction n&apos;est défini : créez-les dans l&apos;onglet Catalogues.</p>}
      <Field label="Message à la famille (facultatif, visible du parent une fois publiée)">
        <textarea
          className="min-h-16 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
          maxLength={300}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex. : retenue mercredi après les cours. Ne racontez pas les faits, la famille verra ce texte."
        />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex gap-2">
        <Button type="submit">Décider la sanction</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function EditForm({ record, onDone, onCancel }: { record: DisciplineRecord; onDone: () => void; onCancel: () => void }) {
  const [gravite, setGravite] = useState<DisciplineGravite>(record.gravite ?? "MOYEN");
  const [description, setDescription] = useState(record.description);
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/discipline/records/${record.id}`, {
        description,
        ...(record.nature === "INCIDENT" ? { gravite } : {}),
        ...(motif.trim() ? { motif } : {}),
      });
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-border bg-surface-muted p-3">
      {record.nature === "INCIDENT" && (
        <Field label="Gravité">
          <Select value={gravite} onChange={(e) => setGravite(e.target.value as DisciplineGravite)}>
            <option value="LEGER">Léger</option>
            <option value="MOYEN">Moyen</option>
            <option value="GRAVE">Grave</option>
          </Select>
        </Field>
      )}
      <Field label="Description">
        <textarea
          className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Motif de la correction (obligatoire une fois le jour de saisie passé)">
        <Input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300} />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex gap-2">
        <Button type="submit">Enregistrer la correction</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/**
 * Liste des signalements. Un enseignant ne reçoit que les siens (portée appliquée par le serveur) ; la vie scolaire et la
 * Direction reçoivent tout. Décider, classer sans suite et annuler ne sont proposés qu'à la Direction (le serveur refuse
 * de toute façon toute autre demande).
 */
export function RecordsPanel({
  canDecide,
  showAuthor,
  fixedNature,
  fixedStatut,
  version,
  onChanged,
}: {
  canDecide: boolean;
  showAuthor: boolean;
  fixedNature?: DisciplineNature;
  fixedStatut?: DisciplineRecordStatus;
  version: number;
  onChanged: () => void;
}) {
  const [records, setRecords] = useState<DisciplineRecord[] | null>(null);
  const [nature, setNature] = useState<DisciplineNature | "">(fixedNature ?? "");
  const [statut, setStatut] = useState<DisciplineRecordStatus | "">(fixedStatut ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sanctioning, setSanctioning] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (nature) q.set("nature", nature);
    if (statut) q.set("statut", statut);
    try {
      setRecords(await api.get<DisciplineRecord[]>(`/discipline/records${q.size ? `?${q.toString()}` : ""}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [nature, statut]);

  useEffect(() => {
    void load();
  }, [load, version]);

  async function withMotif(record: DisciplineRecord, action: "annuler" | "classer", question: string) {
    const motif = prompt(question);
    if (!motif) return;
    setError(null);
    try {
      await api.post(`/discipline/records/${record.id}/${action}`, { motif });
      onChanged();
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      {!fixedNature && !fixedStatut && (
        <div className="mb-3 flex flex-wrap gap-3">
          <div className="w-48">
            <Select value={nature} onChange={(e) => setNature(e.target.value as DisciplineNature | "")} aria-label="Nature">
              <option value="">Toutes les natures</option>
              <option value="INCIDENT">Incidents</option>
              <option value="VALORISATION">Valorisations</option>
            </Select>
          </div>
          <div className="w-48">
            <Select value={statut} onChange={(e) => setStatut(e.target.value as DisciplineRecordStatus | "")} aria-label="Statut">
              <option value="">Tous les statuts</option>
              <option value="OUVERT">Ouverts</option>
              <option value="TRAITE">Traités</option>
              <option value="ANNULE">Annulés</option>
            </Select>
          </div>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {records && records.length === 0 && (
        <EmptyState title="Aucun signalement" description="Les signalements enregistrés apparaîtront ici." />
      )}
      <div className="space-y-3">
        {records?.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  {studentName(r.eleve)} <span className="font-normal text-ink-muted">· {r.classe}</span>
                </p>
                <p className="text-sm text-ink-muted">
                  {r.type.nom} · {dayLabel(r.dateFaits)}
                  {showAuthor && ` · signalé par ${r.auteur.prenom} ${r.auteur.nom}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge color={r.nature === "INCIDENT" ? "red" : "green"}>{r.nature === "INCIDENT" ? "Incident" : "Valorisation"}</Badge>
                {r.gravite && <Badge color={GRAVITE_COLOR[r.gravite]}>{GRAVITE_LABEL[r.gravite]}</Badge>}
                <Badge color={STATUT_COLOR[r.statut]}>{STATUT_LABEL[r.statut]}</Badge>
              </div>
            </div>
            {r.description && <p className="mt-2 whitespace-pre-line text-sm text-ink">{r.description}</p>}
            {r.motifClassement && <p className="mt-1 text-xs text-ink-muted">Classé sans suite : {r.motifClassement}</p>}
            {r.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">Annulé : {r.motifAnnulation}</p>}
            {r.sanctions.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {r.sanctions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <Badge color={SANCTION_COLOR[s.statut]}>{SANCTION_LABEL[s.statut]}</Badge>
                    <span className="text-ink">
                      {s.type}, du {dayLabel(s.dateDebut)}
                      {s.dateFin ? ` au ${dayLabel(s.dateFin)}` : ""}
                    </span>
                    {s.messageFamille && <span className="text-xs text-ink-muted">Message famille : {s.messageFamille}</span>}
                  </li>
                ))}
              </ul>
            )}
            {r.statut !== "ANNULE" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing(editing === r.id ? null : r.id)}>
                  Corriger
                </Button>
                {canDecide && r.nature === "INCIDENT" && r.statut === "OUVERT" && (
                  <>
                    <Button onClick={() => setSanctioning(sanctioning === r.id ? null : r.id)}>Décider une sanction</Button>
                    <Button variant="secondary" onClick={() => void withMotif(r, "classer", "Motif du classement sans suite :")}>
                      Classer sans suite
                    </Button>
                  </>
                )}
                {canDecide && (
                  <Button variant="secondary" onClick={() => void withMotif(r, "annuler", "Motif de l'annulation du signalement :")}>
                    Annuler
                  </Button>
                )}
              </div>
            )}
            {sanctioning === r.id && (
              <SanctionForm
                recordId={r.id}
                onCancel={() => setSanctioning(null)}
                onDone={() => {
                  setSanctioning(null);
                  setNotice("Sanction décidée. Elle n'est visible de la famille qu'une fois publiée (onglet À traiter).");
                  onChanged();
                  void load();
                }}
              />
            )}
            {editing === r.id && (
              <EditForm
                record={r}
                onCancel={() => setEditing(null)}
                onDone={() => {
                  setEditing(null);
                  onChanged();
                  void load();
                }}
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
