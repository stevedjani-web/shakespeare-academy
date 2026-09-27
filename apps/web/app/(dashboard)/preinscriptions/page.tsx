"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import type { Student } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Input, PageTitle } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { ClassPicker } from "@/components/pre-registrations/class-picker";
import {
  STATUT_COLOR,
  STATUT_LABEL,
  dayLabel,
  fileSizeLabel,
  studentName,
  type PreRegistrationChildView,
  type PreRegistrationView,
  type RequestOverview,
} from "@/lib/pre-registrations";

const TABS: Array<{ key: RequestOverview; label: MessageKey }> = [
  { key: "EN_ATTENTE", label: "stu.pre.tabPending" },
  { key: "TRAITEE", label: "stu.pre.tabDone" },
];

/** Ancien élève : recherche du dossier existant, pour ne pas le recréer. La classe de l'année précédente aide à le reconnaître. */
function FindDossier({ child, onPick, picked }: { child: PreRegistrationChildView; onPick: (s: Student | null) => void; picked: Student | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(`${child.eleve.prenom} ${child.eleve.nom}`);
  const [results, setResults] = useState<Student[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await api.get<Student[]>(`/students/search?q=${encodeURIComponent(query.trim())}`));
    } catch {
      // Sans le droit de lire les dossiers, la recherche est simplement indisponible : un nouveau dossier sera créé.
      setResults([]);
    } finally {
      setBusy(false);
    }
  }, [query]);

  // Première recherche automatique, avec le nom de l'enfant.
  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <p className="text-sm font-medium text-ink">{t("stu.pre.findTitle")}</p>
      <p className="text-xs text-ink-muted">{t("stu.pre.findHint")}</p>
      {child.classePrecedente && <p className="text-sm font-medium text-info">{t("stu.pre.prevClass", { level: child.classePrecedente.nom })}</p>}
      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          <span>{t("stu.pre.findLinked", { name: studentName(picked), matricule: picked.matricule })}</span>
          <Button type="button" variant="secondary" onClick={() => onPick(null)}>
            {t("stu.pre.findUnlink")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              value={query}
              placeholder={t("stu.pre.findPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={() => void search()} disabled={busy}>
              {t("stu.pre.findSearch")}
            </Button>
          </div>
          {results && results.length === 0 && <p className="text-xs text-ink-muted">{t("stu.pre.findNone")}</p>}
          {results && results.length > 0 && (
            <ul className="space-y-1.5">
              {results.slice(0, 6).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-ink">{studentName(s)}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {s.matricule}
                      {s.dateNaissance ? ` · ${dayLabel(s.dateNaissance)}` : ""}
                    </span>
                  </span>
                  <Button type="button" variant="secondary" onClick={() => onPick(s)}>
                    {t("stu.pre.findUse")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function AcceptPanel({ child, onDone, onCancel }: { child: PreRegistrationChildView; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [classId, setClassId] = useState("");
  const [picked, setPicked] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; nom: string; prenom: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(forcerCreation: boolean) {
    if (!classId) return setError(t("stu.pre.chooseClass"));
    setError(null);
    setBusy(true);
    try {
      await api.post(`/preinscriptions/enfants/${child.id}/accepter`, {
        classId,
        ...(picked ? { studentId: picked.id } : {}),
        ...(forcerCreation ? { forcerCreation: true } : {}),
      });
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
      {child.typeEleve === "ANCIEN" && <FindDossier child={child} picked={picked} onPick={setPicked} />}
      <ClassPicker initialLevelId={child.niveau?.id} onChange={setClassId} />
      {/* Sans dossier retrouvé, le type d'inscription (donc les frais d'entrée) suit le choix du parent. */}
      {!picked && <p className="text-xs text-ink-muted">{child.typeEleve === "ANCIEN" ? t("stu.pre.enrolTypeOld") : t("stu.pre.enrolTypeNew")}</p>}
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

/** Une fiche enfant d'une demande : ce que la famille a déclaré, et la réponse du secrétariat pour cet enfant seulement. */
function ChildBlock({ child, index, onChanged, onError }: { child: PreRegistrationChildView; index: number; onChanged: () => void; onError: (m: string | null) => void }) {
  const { t } = useI18n();
  const [accepting, setAccepting] = useState(false);

  async function reject() {
    const motif = prompt(t("stu.pre.rejectPrompt", { name: studentName(child.eleve) }));
    if (!motif) return;
    onError(null);
    try {
      await api.post(`/preinscriptions/enfants/${child.id}/rejeter`, { motif });
      onChanged();
    } catch (err) {
      onError(describeError(err));
    }
  }

  // Le bulletin se lit avec le jeton (jamais une adresse publique) : on le récupère puis on l'ouvre dans un onglet.
  async function openReport() {
    onError(null);
    try {
      const blob = await api.blob(`/preinscriptions/enfants/${child.id}/bulletin`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      onError(t("stu.pre.reportFail"));
    }
  }

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stu.pre.childN", { n: index + 1 })}</p>
          <p className="font-medium text-ink">{studentName(child.eleve)}</p>
          <p className="text-sm text-ink-muted">{t("stu.pre.born", { born: dayLabel(child.eleve.dateNaissance) })}</p>
        </div>
        <Badge color={STATUT_COLOR[child.statut]}>{STATUT_LABEL[child.statut]}</Badge>
      </div>

      <div className="mt-2 space-y-1 text-sm">
        <p className="text-ink">{t("stu.pre.requestedClass", { level: child.niveau?.nom ?? t("stu.pre.levelDeleted") })}</p>
        <p className="flex flex-wrap items-center gap-2">
          <Badge color={child.typeEleve === "ANCIEN" ? "blue" : "green"}>{child.typeEleve === "ANCIEN" ? t("stu.pre.kindOld") : t("stu.pre.kindNew")}</Badge>
          {child.typeEleve === "ANCIEN" && child.classePrecedente && <span className="font-medium text-info">{t("stu.pre.prevClass", { level: child.classePrecedente.nom })}</span>}
          {child.typeEleve === "NOUVEAU" && child.ancienEtablissement && <span className="text-ink-muted">{t("stu.pre.prevSchool", { school: child.ancienEtablissement })}</span>}
        </p>
        {child.bulletin && (
          <p className="flex flex-wrap items-center gap-2 text-ink-muted">
            <FileText size={14} className="shrink-0" />
            <span className="min-w-0 truncate">{t("stu.pre.reportLabel", { name: child.bulletin.nom ?? "" })}</span>
            {child.bulletin.taille ? <span className="text-xs">({fileSizeLabel(child.bulletin.taille)})</span> : null}
            <Button type="button" variant="secondary" onClick={() => void openReport()}>
              {t("stu.pre.reportOpen")}
            </Button>
          </p>
        )}
        {child.motifRejet && <p className="text-danger">{t("stu.pre.rejectReason", { reason: child.motifRejet })}</p>}
      </div>

      {child.statut === "EN_ATTENTE" && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setAccepting((v) => !v)}>{t("stu.pre.accept")}</Button>
            <Button variant="secondary" onClick={() => void reject()}>
              {t("stu.pre.reject")}
            </Button>
          </div>
          {accepting && (
            <AcceptPanel
              child={child}
              onCancel={() => setAccepting(false)}
              onDone={() => {
                setAccepting(false);
                onChanged();
              }}
            />
          )}
        </>
      )}
    </li>
  );
}

/**
 * Examen des demandes de préinscription. Même droit que l'inscription manuelle (ENROLLMENT_MANAGE). Une demande porte
 * un parent ou tuteur et un ou plusieurs enfants : chaque enfant est accepté (classe réelle choisie, élève et inscription
 * créés, mêmes garde-fous, doublon compris) ou refusé (motif) séparément.
 */
export default function PreRegistrationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<RequestOverview>("EN_ATTENTE");
  const [rows, setRows] = useState<PreRegistrationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-ink">
                  {t("stu.pre.guardianLine", { name: `${r.responsable.prenom} ${r.responsable.nom}`, phone: r.responsable.telephone })}
                </p>
                <p className="text-sm text-ink-muted">
                  {r.responsable.email ? `${r.responsable.email} · ` : ""}
                  {t("stu.pre.refFiled", { reference: r.reference, filed: dayLabel(r.createdAt) })}
                </p>
                {r.message && <p className="mt-1 text-sm text-ink-muted">{t("stu.pre.quotedMessage", { message: r.message })}</p>}
              </div>
              <div className="text-right">
                <Badge color="primary">{r.compte.enfants === 1 ? t("stu.pre.childrenOne") : t("stu.pre.childrenMany", { n: r.compte.enfants })}</Badge>
                <p className="mt-1 text-xs text-ink-muted">{t("stu.pre.summary", { pending: r.compte.enAttente, accepted: r.compte.acceptes, refused: r.compte.refuses })}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {r.enfants.map((c, i) => (
                <ChildBlock key={c.id} child={c} index={i} onChanged={() => void load()} onError={setError} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
