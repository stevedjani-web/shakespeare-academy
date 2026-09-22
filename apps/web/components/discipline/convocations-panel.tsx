"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { StudentPicker } from "@/components/discipline/student-picker";
import { ISSUE_LABEL, dateTimeLabel, studentName, type ConvocationView } from "@/lib/discipline";

function ConvocationForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [studentId, setStudentId] = useState("");
  const [dateRdv, setDateRdv] = useState("");
  const [lieu, setLieu] = useState("");
  const [objet, setObjet] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) return setError("Choisissez l'élève concerné.");
    try {
      await api.post("/discipline/convocations", {
        studentId,
        dateRdv: new Date(dateRdv).toISOString(),
        lieu,
        objet,
      });
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <Card className="mb-4 border-primary/40">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">Convoquer une famille</h2>
      <form onSubmit={submit} className="space-y-3">
        <StudentPicker value={studentId} onChange={setStudentId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date et heure">
            <Input type="datetime-local" required value={dateRdv} onChange={(e) => setDateRdv(e.target.value)} />
          </Field>
          <Field label="Lieu">
            <Input required maxLength={120} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Bureau de la vie scolaire" />
          </Field>
          <Field label="Objet">
            <Input required maxLength={150} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Entretien avec la famille" />
          </Field>
        </div>
        <p className="text-xs text-ink-muted">
          La famille voit la date, le lieu et l&apos;objet dans son espace et reçoit une alerte sans détail. N&apos;écrivez pas les faits dans l&apos;objet.
        </p>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="flex gap-2">
          <Button type="submit">Envoyer la convocation</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Convocations des familles : création, annulation avec motif, issue du rendez-vous, accusé de réception du parent. */
export function ConvocationsPanel({ canConvoke }: { canConvoke: boolean }) {
  const [rows, setRows] = useState<ConvocationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<ConvocationView[]>("/discipline/convocations"));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body: object) {
    setError(null);
    try {
      await api.post(path, body);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      {canConvoke && !creating && (
        <div className="mb-3">
          <Button onClick={() => setCreating(true)}>Convoquer une famille</Button>
        </div>
      )}
      {creating && (
        <ConvocationForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {rows && rows.length === 0 && <EmptyState title="Aucune convocation" description="Les convocations envoyées aux familles apparaissent ici." />}
      <div className="space-y-3">
        {rows?.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{c.eleve ? studentName(c.eleve) : "Élève"}</p>
                <p className="text-sm text-ink">
                  {dateTimeLabel(c.dateRdv)} · {c.lieu}
                </p>
                <p className="text-sm text-ink-muted">{c.objet}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.statut === "ANNULEE" ? <Badge color="gray">Annulée</Badge> : <Badge color="blue">Envoyée</Badge>}
                {c.statut === "ENVOYEE" && <Badge color={c.accuseLe ? "green" : "orange"}>{c.accuseLe ? "Lue par la famille" : "Pas encore lue"}</Badge>}
                {c.issue && <Badge color={c.issue === "PRESENT" ? "green" : "red"}>{ISSUE_LABEL[c.issue]}</Badge>}
              </div>
            </div>
            {c.motifAnnulation && <p className="mt-1 text-xs text-ink-muted">Annulée : {c.motifAnnulation}</p>}
            {canConvoke && c.statut === "ENVOYEE" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!c.issue && (
                  <>
                    <Button variant="secondary" onClick={() => void act(`/discipline/convocations/${c.id}/issue`, { issue: "PRESENT" })}>
                      Famille présente
                    </Button>
                    <Button variant="secondary" onClick={() => void act(`/discipline/convocations/${c.id}/issue`, { issue: "ABSENT" })}>
                      Famille absente
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    const motif = prompt("Motif de l'annulation de la convocation :");
                    if (motif) void act(`/discipline/convocations/${c.id}/annuler`, { motif });
                  }}
                >
                  Annuler
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
