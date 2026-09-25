"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
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
  natureLabel,
  studentName,
  type DisciplineGravite,
  type DisciplineNature,
  type DisciplineRecord,
  type DisciplineRecordStatus,
  type SanctionType,
} from "@/lib/discipline";

function SanctionForm({ recordId, onDone, onCancel }: { recordId: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
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
  const active = types.filter((ty) => ty.actif);
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-border bg-surface-muted p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("acd.disc.rec.sanction")}>
          <Select required value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">{t("acd.disc.rec.choose")}</option>
            {active.map((ty) => (
              <option key={ty.id} value={ty.id}>
                {ty.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("acd.disc.rec.start")}>
          <Input type="date" required value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </Field>
        <Field label={t("acd.disc.rec.endOptional")}>
          <Input type="date" value={dateFin} min={dateDebut} onChange={(e) => setDateFin(e.target.value)} />
        </Field>
      </div>
      {active.length === 0 && <p className="text-xs text-ink-muted">{t("acd.disc.rec.noSanctionTypes")}</p>}
      <Field label={t("acd.disc.rec.familyMessage")}>
        <textarea
          className="min-h-16 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
          maxLength={300}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("acd.disc.rec.familyMessagePlaceholder")}
        />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex gap-2">
        <Button type="submit">{t("acd.disc.rec.decide")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("acd.disc.rec.cancel")}
        </Button>
      </div>
    </form>
  );
}

function EditForm({ record, onDone, onCancel }: { record: DisciplineRecord; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
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
        <Field label={t("acd.disc.rec.severity")}>
          <Select value={gravite} onChange={(e) => setGravite(e.target.value as DisciplineGravite)}>
            <option value="LEGER">{GRAVITE_LABEL.LEGER}</option>
            <option value="MOYEN">{GRAVITE_LABEL.MOYEN}</option>
            <option value="GRAVE">{GRAVITE_LABEL.GRAVE}</option>
          </Select>
        </Field>
      )}
      <Field label={t("acd.disc.rec.description")}>
        <textarea
          className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label={t("acd.disc.rec.correctionReason")}>
        <Input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300} />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex gap-2">
        <Button type="submit">{t("acd.disc.rec.saveCorrection")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("acd.disc.rec.cancel")}
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
  const { t } = useI18n();
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
            <Select value={nature} onChange={(e) => setNature(e.target.value as DisciplineNature | "")} aria-label={t("acd.disc.rec.natureAria")}>
              <option value="">{t("acd.disc.rec.allKinds")}</option>
              <option value="INCIDENT">{t("acd.disc.rec.incidents")}</option>
              <option value="VALORISATION">{t("acd.disc.rec.commendations")}</option>
            </Select>
          </div>
          <div className="w-48">
            <Select value={statut} onChange={(e) => setStatut(e.target.value as DisciplineRecordStatus | "")} aria-label={t("acd.disc.rec.statusAria")}>
              <option value="">{t("acd.disc.rec.allStatuses")}</option>
              <option value="OUVERT">{t("acd.disc.rec.openPl")}</option>
              <option value="TRAITE">{t("acd.disc.rec.handledPl")}</option>
              <option value="ANNULE">{t("acd.disc.rec.cancelledPl")}</option>
            </Select>
          </div>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {records && records.length === 0 && <EmptyState title={t("acd.disc.rec.emptyTitle")} description={t("acd.disc.rec.emptyDesc")} />}
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
                  {showAuthor && ` · ${t("acd.disc.rec.reportedBy", { name: `${r.auteur.prenom} ${r.auteur.nom}` })}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge color={r.nature === "INCIDENT" ? "red" : "green"}>{natureLabel(r.nature)}</Badge>
                {r.gravite && <Badge color={GRAVITE_COLOR[r.gravite]}>{GRAVITE_LABEL[r.gravite]}</Badge>}
                <Badge color={STATUT_COLOR[r.statut]}>{STATUT_LABEL[r.statut]}</Badge>
              </div>
            </div>
            {r.description && <p className="mt-2 whitespace-pre-line text-sm text-ink">{r.description}</p>}
            {r.motifClassement && <p className="mt-1 text-xs text-ink-muted">{t("acd.disc.rec.closedWithout", { reason: r.motifClassement })}</p>}
            {r.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">{t("acd.disc.rec.cancelledReason", { reason: r.motifAnnulation })}</p>}
            {r.sanctions.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {r.sanctions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <Badge color={SANCTION_COLOR[s.statut]}>{SANCTION_LABEL[s.statut]}</Badge>
                    <span className="text-ink">
                      {s.dateFin
                        ? t("acd.disc.rec.sanctionFromTo", { type: s.type, start: dayLabel(s.dateDebut), end: dayLabel(s.dateFin) })
                        : t("acd.disc.rec.sanctionFrom", { type: s.type, start: dayLabel(s.dateDebut) })}
                    </span>
                    {s.messageFamille && <span className="text-xs text-ink-muted">{t("acd.disc.rec.familyMessageLine", { message: s.messageFamille })}</span>}
                  </li>
                ))}
              </ul>
            )}
            {r.statut !== "ANNULE" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing(editing === r.id ? null : r.id)}>
                  {t("acd.disc.rec.correct")}
                </Button>
                {canDecide && r.nature === "INCIDENT" && r.statut === "OUVERT" && (
                  <>
                    <Button onClick={() => setSanctioning(sanctioning === r.id ? null : r.id)}>{t("acd.disc.rec.decideSanction")}</Button>
                    <Button variant="secondary" onClick={() => void withMotif(r, "classer", t("acd.disc.rec.promptClose"))}>
                      {t("acd.disc.rec.closeWithout")}
                    </Button>
                  </>
                )}
                {canDecide && (
                  <Button variant="secondary" onClick={() => void withMotif(r, "annuler", t("acd.disc.rec.promptCancel"))}>
                    {t("acd.disc.rec.cancel")}
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
                  setNotice(t("acd.disc.rec.sanctionDecided"));
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
