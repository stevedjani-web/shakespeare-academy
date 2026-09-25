"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { Badge, Button, Card, EmptyState, ErrorMessage, PageTitle } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { ClassPicker } from "@/components/pre-registrations/class-picker";
import { STATUT_COLOR, STATUT_LABEL, dayLabel, studentName, type PreRegistrationStatus, type PreRegistrationView } from "@/lib/pre-registrations";

const TABS: Array<{ key: PreRegistrationStatus; label: MessageKey }> = [
  { key: "EN_ATTENTE", label: "stu.pre.tabPending" },
  { key: "ACCEPTEE", label: "stu.pre.tabAccepted" },
  { key: "REJETEE", label: "stu.pre.tabRejected" },
];

function AcceptPanel({ row, onDone, onCancel }: { row: PreRegistrationView; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; nom: string; prenom: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(forcerCreation: boolean) {
    if (!classId) return setError(t("stu.pre.chooseClass"));
    setError(null);
    setBusy(true);
    try {
      await api.post(`/preinscriptions/${row.id}/accepter`, { classId, ...(forcerCreation ? { forcerCreation: true } : {}) });
      onDone();
    } catch (err) {
      if (isApiError(err) && err.status === 409 && err.data && typeof err.data === "object" && "doublonPotentiel" in err.data) {
        setDuplicate((err.data as { doublonPotentiel: { id: string; nom: string; prenom: string } }).doublonPotentiel);
        setError(err.message);
      } else {
        setDuplicate(null);
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-muted p-3">
      <ClassPicker initialLevelId={row.niveau?.id} onChange={setClassId} />
      <ErrorMessage>{error}</ErrorMessage>
      {duplicate && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          {t("stu.pre.duplicateWarn", { name: `${duplicate.prenom} ${duplicate.nom}` })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!duplicate ? (
          <Button onClick={() => void submit(false)} disabled={busy || !classId}>
            {busy ? t("stu.pre.saving") : t("stu.pre.acceptAndEnrol")}
          </Button>
        ) : (
          <Button onClick={() => void submit(true)} disabled={busy}>
            {busy ? t("stu.pre.saving") : t("stu.pre.confirmDespiteDuplicate")}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t("stu.pre.cancel")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Examen des demandes de préinscription. Même droit que l'inscription manuelle (ENROLLMENT_MANAGE) : accepter revient
 * à choisir la classe réelle puis à créer l'élève et son inscription (les mêmes garde-fous s'appliquent, doublon compris).
 */
export default function PreRegistrationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<PreRegistrationStatus>("EN_ATTENTE");
  const [rows, setRows] = useState<PreRegistrationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<PreRegistrationView[]>(`/preinscriptions?statut=${tab}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [tab]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  async function reject(row: PreRegistrationView) {
    const motif = prompt(t("stu.pre.rejectPrompt", { name: studentName(row.eleve) }));
    if (!motif) return;
    setError(null);
    try {
      await api.post(`/preinscriptions/${row.id}/rejeter`, { motif });
      await load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div>
      <PageTitle eyebrow={t("stu.pre.eyebrow")} subtitle={t("stu.pre.subtitle")} helpId="preinscriptions">
        {t("stu.pre.title")}
      </PageTitle>

      <div className="mb-4 flex gap-1 rounded-full border border-border bg-surface-muted p-1">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === tb.key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t(tb.label)}
          </button>
        ))}
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {rows && rows.length === 0 && <EmptyState title={t("stu.pre.emptyTitle")} description={t("stu.pre.emptyDesc")} />}
      <div className="space-y-3">
        {rows?.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  {studentName(r.eleve)} <span className="font-normal text-ink-muted">· {r.niveau?.nom ?? t("stu.pre.levelDeleted")}</span>
                </p>
                <p className="text-sm text-ink-muted">
                  {t("stu.pre.bornRefFiled", {
                    born: dayLabel(r.eleve.dateNaissance),
                    reference: r.reference,
                    filed: dayLabel(r.createdAt),
                  })}
                </p>
                <p className="text-sm text-ink">
                  {t("stu.pre.guardianLine", {
                    name: `${r.responsable.prenom} ${r.responsable.nom}`,
                    phone: r.responsable.telephone,
                  })}
                  {r.responsable.email ? ` · ${r.responsable.email}` : ""}
                </p>
                {r.message && <p className="mt-1 text-sm text-ink-muted">{t("stu.pre.quotedMessage", { message: r.message })}</p>}
                {r.motifRejet && <p className="mt-1 text-sm text-danger">{t("stu.pre.rejectReason", { reason: r.motifRejet })}</p>}
              </div>
              <Badge color={STATUT_COLOR[r.statut]}>{STATUT_LABEL[r.statut]}</Badge>
            </div>
            {r.statut === "EN_ATTENTE" && (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => setAccepting(accepting === r.id ? null : r.id)}>{t("stu.pre.accept")}</Button>
                  <Button variant="secondary" onClick={() => void reject(r)}>
                    {t("stu.pre.reject")}
                  </Button>
                </div>
                {accepting === r.id && (
                  <AcceptPanel
                    row={r}
                    onCancel={() => setAccepting(null)}
                    onDone={() => {
                      setAccepting(null);
                      void load();
                    }}
                  />
                )}
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
