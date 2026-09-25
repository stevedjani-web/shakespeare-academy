"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock, RotateCcw, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatNote, periodLabel, rankLabel, type BulletinListItem, type GradeContext, type PeriodInfo } from "@/lib/grades";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner, SuccessMessage } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";

interface BulletinList {
  periode: PeriodInfo;
  bulletins: BulletinListItem[];
}

/** La Direction valide (fige) les bulletins d'un trimestre pour une classe, les publie aux parents, ou les rouvre. */
export function BulletinsTab({ context }: { context: GradeContext }) {
  const { t } = useI18n();
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
          ? t("acd.bulletins.noticeValidated")
          : action === "publish"
            ? t("acd.bulletins.noticePublished")
            : t("acd.bulletins.noticeReopened"),
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
    return <EmptyState title={t("acd.grades.nothingToShow")} description={t("acd.bulletins.emptyDesc")} />;
  }
  const p = data?.periode;
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("acd.grades.term")}>
            <Select value={termId} onChange={(e) => setTermId(e.target.value)}>
              {context.trimestres.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.libelle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("acd.grades.class")}>
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
              <Badge color={p.statut === "OUVERT" ? "blue" : p.statut === "VALIDE" ? "orange" : "green"}>{periodLabel(p.statut)}</Badge>
              <span className="text-sm text-ink-muted">
                {p.evaluationsSansNote > 0
                  ? t("acd.bulletins.evalCountWithout", { n: p.evaluations, m: p.evaluationsSansNote })
                  : t("acd.bulletins.evalCount", { n: p.evaluations })}
              </span>
            </div>
          </div>

          {p.statut === "OUVERT" && p.matieresSansEvaluation.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
              {t("acd.bulletins.noEvalSubjects", { subjects: p.matieresSansEvaluation.join(", ") })}
            </p>
          )}
          {p.rouvertMotif && p.statut === "OUVERT" && (
            <p className="mt-2 text-sm text-ink-muted">{t("acd.bulletins.reopenedReason", { reason: p.rouvertMotif })}</p>
          )}
          {p.correctionsDepuisValidation > 0 && p.statut === "VALIDE" && (
            <p className="mt-3 flex items-start gap-2 text-sm text-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {t("acd.bulletins.corrected", { n: p.correctionsDepuisValidation })}
            </p>
          )}

          {canValidate && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              {p.statut !== "PUBLIE" && (
                <Button onClick={() => run("validate")} disabled={busy || p.evaluations === 0}>
                  {busy ? <Spinner /> : <Lock size={15} />} {p.statut === "VALIDE" ? t("acd.bulletins.validateAgain") : t("acd.bulletins.validate")}
                </Button>
              )}
              {p.statut === "VALIDE" && (
                <Button variant="accent" onClick={() => run("publish")} disabled={busy || p.correctionsDepuisValidation > 0}>
                  <Send size={15} /> {t("acd.bulletins.publish")}
                </Button>
              )}
              {p.statut !== "OUVERT" && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-64">
                    <Field label={t("acd.bulletins.reopenReason")}>
                      <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("acd.bulletins.reopenPlaceholder")} maxLength={500} />
                    </Field>
                  </div>
                  <Button variant="secondary" onClick={() => run("reopen")} disabled={busy || motif.trim().length < 3}>
                    <RotateCcw size={15} /> {t("acd.bulletins.reopen")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {data && p && p.statut === "OUVERT" && <EmptyState title={t("acd.bulletins.noneTitle")} description={t("acd.bulletins.noneDesc")} />}

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
                    {t("acd.bulletins.rowMeta", { id: b.matricule, avg: formatNote(b.moyenneGenerale), rank: rankLabel(b.rang, b.effectif) })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.appreciationGenerale && <CheckCircle2 size={15} className="text-success" aria-label={t("acd.bulletins.commentEntered")} />}
                  {canValidate && p?.statut === "VALIDE" && (
                    <Button variant="ghost" onClick={() => setEditing({ id: b.id, texte: b.appreciationGenerale ?? "" })}>
                      {t("acd.bulletins.comment")}
                    </Button>
                  )}
                  <Link href={`/bulletins/${b.id}`} className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted">
                    {t("acd.bulletins.viewPrint")}
                  </Link>
                </div>
              </div>
              {editing?.id === b.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-64 flex-1">
                    <Field label={t("acd.bulletins.overallComment")}>
                      <Input value={editing.texte} onChange={(e) => setEditing({ id: b.id, texte: e.target.value })} maxLength={1000} />
                    </Field>
                  </div>
                  <Button onClick={saveAppreciation}>{t("acd.bulletins.save")}</Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    {t("acd.bulletins.cancel")}
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
