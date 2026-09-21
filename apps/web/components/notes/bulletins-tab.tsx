"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock, RotateCcw, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatNote, PERIOD_LABEL, rankLabel, type BulletinListItem, type GradeContext, type PeriodInfo } from "@/lib/grades";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

interface BulletinList {
  periode: PeriodInfo;
  bulletins: BulletinListItem[];
}

/** La Direction valide (fige) les bulletins d'un trimestre pour une classe, les publie aux parents, ou les rouvre. */
export function BulletinsTab({ context }: { context: GradeContext }) {
  const { hasPermission } = useAuth();
  const canValidate = hasPermission("BULLETIN_VALIDATE");
  const [termId, setTermId] = useState(context.trimestres[0]?.id ?? "");
  const [classId, setClassId] = useState(context.classes[0]?.id ?? "");
  const [data, setData] = useState<BulletinList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [motif, setMotif] = useState("");
  const [editing, setEditing] = useState<{ id: string; texte: string } | null>(null);

  const load = useCallback(async () => {
    if (!termId || !classId) return;
    try {
      setData(await api.get<BulletinList>(`/grades/bulletins?termId=${termId}&classId=${classId}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [termId, classId]);

  useEffect(() => {
    setData(null);
    setNotice(null);
    void load();
  }, [load]);

  async function run(action: "validate" | "publish" | "reopen") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/grades/period/${action}`, { termId, classId, ...(action === "reopen" ? { motif: motif.trim() } : {}) });
      setNotice(
        action === "validate"
          ? "Bulletins validés : les notes sont figées."
          : action === "publish"
            ? "Bulletins publiés : les responsables sont prévenus."
            : "Trimestre rouvert : les enseignants peuvent de nouveau saisir.",
      );
      if (action === "reopen") setMotif("");
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAppreciation() {
    if (!editing) return;
    try {
      await api.put(`/grades/bulletins/${editing.id}/appreciation`, { texte: editing.texte });
      setEditing(null);
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (context.trimestres.length === 0 || context.classes.length === 0) {
    return <EmptyState title="Rien à afficher" description="Il faut un trimestre et une classe pour gérer des bulletins." />;
  }
  const p = data?.periode;
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
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
      </Card>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {!p && !error && <Spinner className="h-6 w-6 text-primary" />}

      {p && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge color={p.statut === "OUVERT" ? "blue" : p.statut === "VALIDE" ? "orange" : "green"}>{PERIOD_LABEL[p.statut]}</Badge>
              <span className="text-sm text-ink-muted">
                {p.evaluations} évaluation(s){p.evaluationsSansNote > 0 ? `, dont ${p.evaluationsSansNote} sans aucune note` : ""}
              </span>
            </div>
          </div>

          {p.statut === "OUVERT" && p.matieresSansEvaluation.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              Sans évaluation ce trimestre : {p.matieresSansEvaluation.join(", ")}. Ces matières n&apos;entreront pas dans la moyenne.
            </p>
          )}
          {p.rouvertMotif && p.statut === "OUVERT" && <p className="mt-2 text-sm text-ink-muted">Rouvert : {p.rouvertMotif}</p>}
          {p.correctionsDepuisValidation > 0 && p.statut === "VALIDE" && (
            <p className="mt-3 flex items-start gap-2 text-sm text-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {p.correctionsDepuisValidation} note(s) ont été corrigées depuis la validation : validez de nouveau pour que les bulletins en tiennent compte.
            </p>
          )}

          {canValidate && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              {p.statut !== "PUBLIE" && (
                <Button onClick={() => run("validate")} disabled={busy || p.evaluations === 0}>
                  {busy ? <Spinner /> : <Lock size={15} />} {p.statut === "VALIDE" ? "Valider de nouveau" : "Valider et figer"}
                </Button>
              )}
              {p.statut === "VALIDE" && (
                <Button variant="accent" onClick={() => run("publish")} disabled={busy || p.correctionsDepuisValidation > 0}>
                  <Send size={15} /> Publier aux parents
                </Button>
              )}
              {p.statut !== "OUVERT" && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-64">
                    <Field label="Motif pour rouvrir">
                      <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. un devoir a été oublié" maxLength={500} />
                    </Field>
                  </div>
                  <Button variant="secondary" onClick={() => run("reopen")} disabled={busy || motif.trim().length < 3}>
                    <RotateCcw size={15} /> Rouvrir
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {data && p && p.statut === "OUVERT" && (
        <EmptyState
          title="Aucun bulletin pour l'instant"
          description="Les bulletins sont créés quand la Direction valide le trimestre. Tant qu'il est ouvert, les enseignants saisissent leurs notes."
        />
      )}

      {data && data.bulletins.length > 0 && (
        <ul className="space-y-2">
          {data.bulletins.map((b) => (
            <li key={b.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {b.nom} {b.prenom}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {b.matricule} · moyenne {formatNote(b.moyenneGenerale)} · rang {rankLabel(b.rang, b.effectif)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.appreciationGenerale && <CheckCircle2 size={15} className="text-success" aria-label="Appréciation saisie" />}
                  {canValidate && p?.statut === "VALIDE" && (
                    <Button variant="ghost" onClick={() => setEditing({ id: b.id, texte: b.appreciationGenerale ?? "" })}>
                      Appréciation
                    </Button>
                  )}
                  <Link href={`/bulletins/${b.id}`} className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted">
                    Voir / imprimer
                  </Link>
                </div>
              </div>
              {editing?.id === b.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-64 flex-1">
                    <Field label="Appréciation générale">
                      <Input value={editing.texte} onChange={(e) => setEditing({ id: b.id, texte: e.target.value })} maxLength={1000} />
                    </Field>
                  </div>
                  <Button onClick={saveAppreciation}>Enregistrer</Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    Annuler
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
