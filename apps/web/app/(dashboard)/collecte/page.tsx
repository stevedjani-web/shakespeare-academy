"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, ClipboardList, Copy, Hourglass, Inbox, Link2, Lock, LockOpen, RefreshCw, TimerReset, UserCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatDate } from "@/lib/format";
import { useSchoolBrand } from "@/lib/school-brand";
import { useAuthImage } from "@/lib/use-auth-image";
import { Badge, Button, Card, EmptyState, ErrorMessage, PageTitle, Select, StatCard, SuccessMessage } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { buildSection, type ExportSection } from "@/lib/export";
import { describeError } from "@/components/vie-scolaire/shared";
import {
  activatedMessage,
  collectMessage,
  collectUrl,
  hasConflict,
  parentLoginUrl,
  type ClassDetail,
  type ClassProgress,
  type CollectLinkView,
  type FamilyAlert,
  type FamilyAnalysis,
  type FamilyChange,
  type FamilyChildView,
  type FamilySubmissionView,
  type ClassRosterStudent,
} from "@/lib/family-collection";

type Tab = "progress" | "pending" | "done";

const tr = (key: string, params?: Record<string, string | number>) => translate(key as MessageKey, params);

/** Texte d'une alerte du serveur, avec ses valeurs. */
function alertText(a: FamilyAlert): string {
  const d = (a.detail ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "—" : String(v));
  const params: Record<string, string> = { avant: s(d.avant), apres: s(d.apres), declaree: s(d.declaree), reelle: s(d.reelle) };
  if (typeof d.champ === "string") params.champ = tr(`fam.adm.field.${d.champ}`);
  if (Array.isArray(d.responsables)) {
    params.liste = (d.responsables as Array<{ nom: string; telephone: string | null }>).map((r) => (r.telephone ? `${r.nom} (${r.telephone})` : r.nom)).join(", ");
  }
  return tr(`fam.adm.alert.${a.code}`, params);
}

function changeLine(c: FamilyChange): string {
  const label = tr(`fam.adm.field.${c.champ}`);
  if (c.champ === "photo") return label;
  if (c.cible === "COMPTE") return `${label} : ${tr("fam.adm.accountCreated")}`;
  if (c.type === "remplacement") return `${label} : ${c.avant ?? "—"} → ${c.apres ?? "—"}`;
  return `${label} : ${c.apres ?? "—"}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------ Avancement par classe

function ClassCard({ row, ecole, onChanged, onNotice }: { row: ClassProgress; ecole: string; onChanged: () => void; onNotice: (text: string, error?: boolean) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const lien: CollectLinkView | null = row.lien;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const pct = row.effectif === 0 ? 0 : Math.round((row.complets / row.effectif) * 100);
  const state = !lien ? null : lien.expire ? "expired" : lien.actif ? "active" : "closed";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (e) {
      onNotice(describeError(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, ok: MessageKey) {
    onNotice((await copy(text)) ? t(ok) : t("fam.adm.copyFailed"), false);
  }

  async function toggleMissing() {
    const next = !showMissing;
    setShowMissing(next);
    if (next && !detail) {
      try {
        setDetail(await api.get<ClassDetail>(`/family-collection/classes/${row.classId}`));
      } catch (e) {
        onNotice(describeError(e), true);
      }
    }
  }

  const missing: ClassRosterStudent[] = detail ? detail.eleves.filter((s) => !s.dateNaissance || !s.responsable) : [];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-semibold text-ink">{row.classe}</p>
          <p className="text-xs text-ink-muted">{row.section}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.enAttente > 0 && <Badge color="orange">{t("fam.adm.waiting", { n: row.enAttente })}</Badge>}
          {state === "active" && <Badge color="green">{t("fam.adm.linkActive")}</Badge>}
          {state === "closed" && <Badge color="slate">{t("fam.adm.linkClosed")}</Badge>}
          {state === "expired" && <Badge color="red">{t("fam.adm.linkExpired")}</Badge>}
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-sm font-medium text-ink">{t("fam.adm.complete", { done: row.complets, total: row.effectif })}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {t("fam.adm.noDate", { n: row.sansDate })} · {t("fam.adm.noGuardian", { n: row.sansResponsable })} · {t("fam.adm.accounts", { n: row.comptesActifs })}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!lien ? (
          <>
            <p className="w-full text-sm text-ink-muted">{t("fam.adm.noLink")}</p>
            <Button type="button" disabled={busy} onClick={() => void run(() => api.post(`/family-collection/classes/${row.classId}/link`, {}))}>
              <Link2 size={16} /> {t("fam.adm.createLink")}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" disabled={busy || state !== "active"} onClick={() => void copyText(collectMessage({ ecole, classe: row.classe, url: collectUrl(origin, lien.token) }), "fam.adm.messageCopied")}>
              <Copy size={16} /> {t("fam.adm.copyMessage")}
            </Button>
            <Button type="button" variant="secondary" disabled={busy || state !== "active"} onClick={() => void copyText(collectUrl(origin, lien.token), "fam.adm.linkCopied")}>
              <Link2 size={16} /> {t("fam.adm.copyLink")}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void copyText(activatedMessage({ ecole, classe: row.classe, url: parentLoginUrl(origin) }), "fam.adm.messageCopied")}>
              <CheckCheck size={16} /> {t("fam.adm.copyActivated")}
            </Button>
          </>
        )}
      </div>

      {lien && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
          <span>{t("fam.adm.validUntil", { date: formatDate(lien.expireLe) })}</span>
          <button type="button" disabled={busy} onClick={() => void run(() => api.patch(`/family-collection/classes/${row.classId}/link`, { prolonger: true }))} className="inline-flex items-center gap-1 font-semibold text-primary underline disabled:opacity-50">
            <TimerReset size={13} /> {t("fam.adm.extend")}
          </button>
          {lien.actif ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm(t("fam.adm.closeConfirm")) && void run(() => api.patch(`/family-collection/classes/${row.classId}/link`, { actif: false }))}
              className="inline-flex items-center gap-1 font-semibold text-primary underline disabled:opacity-50"
            >
              <Lock size={13} /> {t("fam.adm.close")}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void run(() => api.patch(`/family-collection/classes/${row.classId}/link`, { actif: true }))} className="inline-flex items-center gap-1 font-semibold text-primary underline disabled:opacity-50">
              <LockOpen size={13} /> {t("fam.adm.reopen")}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(t("fam.adm.regenerateConfirm")) && void run(() => api.post(`/family-collection/classes/${row.classId}/link`, { regenerer: true }))}
            className="inline-flex items-center gap-1 font-semibold text-danger underline disabled:opacity-50"
          >
            <RefreshCw size={13} /> {t("fam.adm.regenerate")}
          </button>
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <button type="button" onClick={() => void toggleMissing()} className="text-sm font-semibold text-primary underline">
          {t("fam.adm.toFollowUp", { n: row.effectif - row.complets })}
        </button>
        {showMissing && detail && (
          <div className="mt-2">
            {missing.length === 0 ? (
              <p className="text-sm text-success">{t("fam.adm.allComplete")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {missing.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink">
                      {s.prenom} {s.nom} <span className="text-xs text-ink-muted">· {s.matricule}</span>
                    </span>
                    <span className="text-xs text-ink-muted">
                      {t("fam.adm.lacks", {
                        what: [!s.dateNaissance && t("fam.adm.lacksDate"), !s.responsable && t("fam.adm.lacksGuardian")].filter(Boolean).join(", "),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ File de validation

function ChildRow({ child, classes, onChanged }: { child: FamilyChildView; classes: ClassProgress[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [roster, setRoster] = useState<ClassRosterStudent[] | null>(null);
  const [studentId, setStudentId] = useState("");
  const [override, setOverride] = useState<FamilyAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysis = override ?? child.analyse;
  const pending = child.statut === "EN_ATTENTE";
  const proposed = analysis?.etudiantPropose ?? null;
  const conflict = hasConflict(analysis);
  const canValidate = pending && !!(studentId || proposed);
  // Photo envoyée par le parent : fichier privé, lu avec le jeton du personnel (jamais une adresse publique).
  const photoSrc = useAuthImage(pending && child.photo ? `/family-collection/children/${child.id}/photo` : null);

  async function loadRoster() {
    if (roster) return;
    try {
      setRoster((await api.get<ClassDetail>(`/family-collection/classes/${child.classe.id}`)).eleves);
    } catch (e) {
      setError(describeError(e));
    }
  }

  // Le parent s'est trompé de classe : on corrige la classe déclarée, et la recherche se refait dans la bonne classe.
  async function changeClass(classId: string) {
    if (classId === child.classe.id) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/family-collection/children/${child.id}/classe`, { classId });
      setRoster(null);
      setStudentId("");
      setOverride(null);
      onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function choose(id: string) {
    setStudentId(id);
    setError(null);
    if (!id || id === child.analyse?.etudiantPropose?.id) {
      setOverride(null);
      if (id === child.analyse?.etudiantPropose?.id) setStudentId("");
      return;
    }
    try {
      setOverride(await api.get<FamilyAnalysis>(`/family-collection/children/${child.id}/analyse?studentId=${encodeURIComponent(id)}`));
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/family-collection/children/${child.id}/valider`, { studentId: studentId || undefined, confirmer: conflict || undefined });
      onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function refuse() {
    const motif = window.prompt(t("fam.adm.refusePrompt"));
    if (!motif || motif.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/family-collection/children/${child.id}/refuser`, { motif: motif.trim() });
      onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-surface-muted/50 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {photoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt={t("fam.adm.photoBy")} title={t("fam.adm.photoBy")} className="h-16 w-12 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-border" />
          )}
          <div>
          <p className="font-semibold text-ink">
            {child.prenom} {child.nom}
          </p>
          <p className="text-xs text-ink-muted">
            {t("fam.adm.bornOn", { date: formatDate(child.dateNaissance) })}
            {child.lieuNaissance && t("fam.adm.bornAt", { place: child.lieuNaissance })} · {t("fam.adm.declaredClass", { classe: child.classe.nom })}
          </p>
          </div>
        </div>
        {child.statut === "VALIDE" && <Badge color="green">{t("fam.adm.validated")}</Badge>}
        {child.statut === "REFUSE" && <Badge color="red">{t("fam.adm.refused")}</Badge>}
        {pending && analysis && <Badge color={analysis.match === "EXACT" || analysis.match === "CHOISI" ? "green" : analysis.match === "AUCUN" ? "red" : "orange"}>{tr(`fam.adm.match.${analysis.match}`)}</Badge>}
      </div>

      {!pending && child.eleve && (
        <p className="mt-2 text-sm text-ink">{t("fam.adm.studentIs", { name: `${child.eleve.prenom} ${child.eleve.nom}`, matricule: child.eleve.matricule })}</p>
      )}
      {child.statut === "REFUSE" && child.motifRefus && <p className="mt-2 text-sm text-danger">{t("fam.adm.refusedReason", { reason: child.motifRefus })}</p>}

      {pending && analysis && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t("fam.adm.declaredClassLabel")}</label>
            <Select value={child.classe.id} disabled={busy} onChange={(e) => void changeClass(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.classe} · {c.section}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ink-muted">{t("fam.adm.changeClassHelp")}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t("fam.adm.chooseStudentLabel")}</label>
            <Select value={studentId || proposed?.id || ""} onFocus={() => void loadRoster()} onChange={(e) => void choose(e.target.value)}>
              <option value="">{t("fam.adm.chooseStudent")}</option>
              {proposed && !roster && (
                <option value={proposed.id}>
                  {proposed.prenom} {proposed.nom} · {proposed.matricule}
                  {proposed.classe ? ` · ${proposed.classe}` : ""}
                </option>
              )}
              {(roster ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.prenom} {s.nom} · {s.matricule}
                </option>
              ))}
            </Select>
          </div>

          {analysis.alertes.length > 0 && (
            <ul className="space-y-1.5">
              {analysis.alertes.map((a, i) => (
                <li key={i} className={`rounded-xl px-3 py-2 text-sm ${a.severite === "conflit" ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`}>
                  {alertText(a)}
                </li>
              ))}
            </ul>
          )}

          {(studentId || proposed) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.adm.willSave")}</p>
              {analysis.modifications.length === 0 ? (
                <p className="mt-1 text-sm text-ink-muted">{t("fam.adm.nothingNew")}</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
                  {analysis.modifications.map((c, i) => (
                    <li key={i}>{changeLine(c)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ErrorMessage>{error}</ErrorMessage>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !canValidate} variant={conflict ? "secondary" : "primary"} onClick={() => void validate()}>
              <CheckCheck size={16} /> {conflict ? t("fam.adm.validateAnyway") : t("fam.adm.validate")}
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => void refuse()}>
              <X size={16} /> {t("fam.adm.refuse")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SubmissionCard({ sub, classes, onChanged }: { sub: FamilySubmissionView; classes: ClassProgress[]; onChanged: () => void }) {
  const { t } = useI18n();
  const r = sub.responsable;
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.adm.guardian")}</p>
      <p className="font-display text-lg font-semibold text-ink">
        {r.prenom} {r.nom}
      </p>
      <p className="text-sm text-ink-muted">
        {r.lien && `${r.lien} · `}
        {r.telephone}
        {r.email && ` · ${r.email}`}
        {r.profession && ` · ${r.profession}`}
        {r.adresse && ` · ${r.adresse}`}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{t("fam.adm.received", { date: formatDate(sub.creeLe) })}</p>
      <ul className="mt-3 space-y-2.5">
        {sub.enfants.map((c) => (
          <ChildRow key={c.id} child={c} classes={classes} onChanged={onChanged} />
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ Page

export default function CollectePage() {
  const { t } = useI18n();
  const { brand } = useSchoolBrand({ withLogo: false });
  const ecole = brand?.nom ?? "Shakespeare Academy";
  const [tab, setTab] = useState<Tab>("progress");
  const [classes, setClasses] = useState<ClassProgress[] | null>(null);
  const [subs, setSubs] = useState<FamilySubmissionView[] | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Élèves dont le dossier est incomplet, toutes classes : alimente l'export « à relancer ».
  const [followUp, setFollowUp] = useState<Array<{ row: ClassProgress; detail: ClassDetail }> | null>(null);

  const loadClasses = useCallback(async () => {
    try {
      setClasses(await api.get<ClassProgress[]>("/family-collection/classes"));
    } catch (e) {
      setNotice({ text: describeError(e), error: true });
    }
  }, []);

  const loadSubs = useCallback(async () => {
    if (tab === "progress") return;
    try {
      const qs = new URLSearchParams({ statut: tab === "pending" ? "EN_ATTENTE" : "TRAITEES" });
      if (classFilter) qs.set("classId", classFilter);
      setSubs(await api.get<FamilySubmissionView[]>(`/family-collection/submissions?${qs.toString()}`));
    } catch (e) {
      setNotice({ text: describeError(e), error: true });
    }
  }, [tab, classFilter]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    setSubs(null);
    void loadSubs();
  }, [loadSubs]);

  useEffect(() => {
    if (tab !== "progress" || !classes) return;
    let cancelled = false;
    const need = classes.filter((c) => c.effectif - c.complets > 0);
    void Promise.all(
      need.map((row) =>
        api
          .get<ClassDetail>(`/family-collection/classes/${row.classId}`)
          .then((detail) => ({ row, detail }))
          .catch(() => null),
      ),
    ).then((res) => {
      if (!cancelled) setFollowUp(res.filter((x): x is { row: ClassProgress; detail: ClassDetail } => x !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, classes]);

  function refresh() {
    void loadClasses();
    void loadSubs();
  }

  async function createAll() {
    setBusy(true);
    try {
      const res = await api.post<{ crees: number }>("/family-collection/links/generate-all", {});
      setNotice({ text: t("fam.adm.createdN", { n: res.crees }), error: false });
      void loadClasses();
    } catch (e) {
      setNotice({ text: describeError(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function validateSimple() {
    if (!classFilter) return;
    const name = classes?.find((c) => c.classId === classFilter)?.classe ?? "";
    setBusy(true);
    try {
      const res = await api.post<{ valides: number; aExaminer: number }>(`/family-collection/classes/${classFilter}/valider-simples`, {});
      setNotice({ text: `${name} : ${t("fam.adm.validateSimpleResult", { valid: res.valides, rest: res.aExaminer })}`, error: false });
      refresh();
    } catch (e) {
      setNotice({ text: describeError(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const sum = (pick: (c: ClassProgress) => number) => (classes ?? []).reduce((n, c) => n + pick(c), 0);
  const waitingTotal = sum((c) => c.enAttente);
  const validatedTotal = sum((c) => c.valides);
  const refusedTotal = sum((c) => c.refuses);
  const doneTotal = validatedTotal + refusedTotal;
  const receivedTotal = waitingTotal + doneTotal;
  const enrolledTotal = sum((c) => c.effectif);
  const completeTotal = sum((c) => c.complets);
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "progress", label: t("fam.adm.tabProgress") },
    { key: "pending", label: waitingTotal > 0 ? t("fam.adm.tabPendingN", { n: waitingTotal }) : t("fam.adm.tabPending") },
    { key: "done", label: doneTotal > 0 ? t("fam.adm.tabDoneN", { n: doneTotal }) : t("fam.adm.tabDone") },
  ];
  const selectedClass = classes?.find((c) => c.classId === classFilter);

  const byText = (a: string, b: string) => a.localeCompare(b, "fr");
  const linkLabel = (c: ClassProgress) => (!c.lien ? t("fam.adm.xl.noLink") : c.lien.expire ? t("fam.adm.linkExpired") : c.lien.actif ? t("fam.adm.linkActive") : t("fam.adm.linkClosed"));

  // Avancement : un tableau par classe, puis la liste des élèves dont le dossier est à compléter (pour la relance).
  const progressSections: ExportSection[] = (() => {
    const rows = [...(classes ?? [])].sort((a, b) => byText(a.section, b.section) || byText(a.classe, b.classe));
    const summary = buildSection(
      t("fam.adm.xl.sheetSummary"),
      [
        { header: t("fam.adm.xl.colSection"), value: (c: ClassProgress) => c.section },
        { header: t("fam.adm.xl.colClass"), value: (c: ClassProgress) => c.classe },
        { header: t("fam.adm.xl.colEnrolled"), value: (c: ClassProgress) => c.effectif, kind: "number" as const },
        { header: t("fam.adm.xl.colComplete"), value: (c: ClassProgress) => c.complets, kind: "number" as const },
        { header: t("fam.adm.xl.colMissing"), value: (c: ClassProgress) => c.effectif - c.complets, kind: "number" as const },
        { header: t("fam.adm.xl.colReceived"), value: (c: ClassProgress) => c.enAttente + c.valides + c.refuses, kind: "number" as const },
        { header: t("fam.adm.xl.colWaiting"), value: (c: ClassProgress) => c.enAttente, kind: "number" as const },
        { header: t("fam.adm.xl.colValidated"), value: (c: ClassProgress) => c.valides, kind: "number" as const },
        { header: t("fam.adm.xl.colRefused"), value: (c: ClassProgress) => c.refuses, kind: "number" as const },
        { header: t("fam.adm.xl.colAccounts"), value: (c: ClassProgress) => c.comptesActifs, kind: "number" as const },
        { header: t("fam.adm.xl.colLink"), value: (c: ClassProgress) => linkLabel(c) },
      ],
      rows,
      [
        "",
        "",
        enrolledTotal,
        completeTotal,
        enrolledTotal - completeTotal,
        receivedTotal,
        waitingTotal,
        validatedTotal,
        refusedTotal,
        sum((c) => c.comptesActifs),
        "",
      ],
    );
    type FollowRow = { section: string; classe: string; s: ClassRosterStudent };
    const follow: FollowRow[] = (followUp ?? [])
      .flatMap(({ row, detail }) => detail.eleves.filter((s) => !s.dateNaissance || !s.responsable).map((s) => ({ section: row.section, classe: row.classe, s })))
      .sort((a, b) => byText(a.section, b.section) || byText(a.classe, b.classe) || byText(a.s.nom, b.s.nom) || byText(a.s.prenom, b.s.prenom));
    const followSection = buildSection(
      t("fam.adm.xl.sheetFollowUp"),
      [
        { header: t("fam.adm.xl.colClass"), value: (r: FollowRow) => r.classe },
        { header: t("fam.adm.xl.colStudent"), value: (r: FollowRow) => `${r.s.nom} ${r.s.prenom}` },
        { header: t("fam.adm.xl.colMatricule"), value: (r: FollowRow) => r.s.matricule },
        { header: t("fam.adm.xl.colLacks"), value: (r: FollowRow) => [!r.s.dateNaissance && t("fam.adm.lacksDate"), !r.s.responsable && t("fam.adm.lacksGuardian")].filter(Boolean).join(", ") },
        { header: t("fam.adm.xl.colPhone"), value: (r: FollowRow) => r.s.telephone ?? "" },
      ],
      follow,
    );
    return [summary, followSection];
  })();

  // À traiter / traités : une ligne par enfant déclaré, filtrée comme l'écran (classe choisie).
  type ChildRowData = { sub: FamilySubmissionView; child: FamilyChildView };
  const childRows: ChildRowData[] = (subs ?? [])
    .flatMap((sub) => sub.enfants.filter((child) => (tab === "pending" ? child.statut === "EN_ATTENTE" : child.statut !== "EN_ATTENTE")).map((child) => ({ sub, child })))
    .sort((a, b) => byText(a.child.classe.nom, b.child.classe.nom) || byText(a.child.nom, b.child.nom) || byText(a.child.prenom, b.child.prenom));
  const childColumns = [
    { header: t("fam.adm.xl.colDeclaredClass"), value: (r: ChildRowData) => r.child.classe.nom },
    { header: t("fam.adm.xl.colChild"), value: (r: ChildRowData) => `${r.child.prenom} ${r.child.nom}` },
    { header: t("fam.adm.xl.colBirth"), value: (r: ChildRowData) => (r.child.dateNaissance ? formatDate(r.child.dateNaissance) : "") },
    { header: t("fam.adm.xl.colGuardian"), value: (r: ChildRowData) => `${r.sub.responsable.prenom} ${r.sub.responsable.nom}` },
    { header: t("fam.adm.xl.colGuardianPhone"), value: (r: ChildRowData) => r.sub.responsable.telephone },
    { header: t("fam.adm.xl.colRelation"), value: (r: ChildRowData) => r.sub.responsable.lien ?? "" },
    { header: t("fam.adm.xl.colReceivedOn"), value: (r: ChildRowData) => formatDate(r.sub.creeLe) },
  ];
  const pendingSection = buildSection(
    t("fam.adm.xl.sheetPending"),
    [
      ...childColumns,
      { header: t("fam.adm.xl.colMatching"), value: (r: ChildRowData) => (r.child.analyse ? tr(`fam.adm.match.${r.child.analyse.match}`) : "") },
      {
        header: t("fam.adm.xl.colProposed"),
        value: (r: ChildRowData) => {
          const e = r.child.analyse?.etudiantPropose;
          return e ? `${e.prenom} ${e.nom} (${e.matricule})` : "";
        },
      },
      { header: t("fam.adm.xl.colTodo"), value: (r: ChildRowData) => (r.child.analyse ? tr(`fam.adm.xl.todo.${r.child.analyse.match}`) : "") },
    ],
    childRows,
  );
  const doneSection = buildSection(
    t("fam.adm.xl.sheetDone"),
    [
      ...childColumns,
      { header: t("fam.adm.xl.colStatus"), value: (r: ChildRowData) => (r.child.statut === "VALIDE" ? t("fam.adm.validated") : t("fam.adm.refused")) },
      { header: t("fam.adm.xl.colStudent"), value: (r: ChildRowData) => (r.child.eleve ? `${r.child.eleve.prenom} ${r.child.eleve.nom} (${r.child.eleve.matricule})` : "") },
      { header: t("fam.adm.xl.colReason"), value: (r: ChildRowData) => r.child.motifRefus ?? "" },
      { header: t("fam.adm.xl.colTreatedOn"), value: (r: ChildRowData) => (r.child.traiteLe ? formatDate(r.child.traiteLe) : "") },
    ],
    childRows,
  );
  const exportProps =
    tab === "progress"
      ? { fileName: t("fam.adm.xl.fileProgress"), title: t("fam.adm.xl.titleProgress"), sections: progressSections, disabled: !classes }
      : tab === "pending"
        ? { fileName: t("fam.adm.xl.filePending"), title: t("fam.adm.xl.titlePending"), sections: [pendingSection], disabled: !subs }
        : { fileName: t("fam.adm.xl.fileDone"), title: t("fam.adm.xl.titleDone"), sections: [doneSection], disabled: !subs };

  return (
    <div>
      <PageTitle subtitle={t("fam.adm.subtitle")} helpId="collecte">
        {t("fam.adm.title")}
      </PageTitle>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("fam.adm.statReceived")} value={receivedTotal} tone="info" icon={<Inbox size={18} />} hint={t("fam.adm.statReceivedHint")} />
        <StatCard
          label={t("fam.adm.statDone")}
          value={doneTotal}
          tone="success"
          icon={<CheckCheck size={18} />}
          hint={t("fam.adm.statDoneHint", { valid: validatedTotal, refused: refusedTotal })}
          progress={receivedTotal === 0 ? null : (doneTotal / receivedTotal) * 100}
        />
        <StatCard label={t("fam.adm.statPending")} value={waitingTotal} tone={waitingTotal > 0 ? "warning" : "success"} icon={<Hourglass size={18} />} hint={t("fam.adm.statPendingHint")} />
        <StatCard
          label={t("fam.adm.statComplete")}
          value={completeTotal}
          tone="primary"
          icon={<UserCheck size={18} />}
          hint={t("fam.adm.statCompleteHint", { done: completeTotal, total: enrolledTotal })}
          progress={enrolledTotal === 0 ? null : (completeTotal / enrolledTotal) * 100}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === x.key ? "bg-primary text-white" : "bg-surface-muted text-ink hover:bg-primary-soft"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
        <ExportButtons {...exportProps} landscape subtitle={t("fam.adm.xl.subtitleN", { n: tab === "progress" ? (classes ?? []).length : childRows.length })} />
      </div>

      <div className="mb-4 space-y-2">
        <ErrorMessage>{notice?.error ? notice.text : null}</ErrorMessage>
        <SuccessMessage>{notice && !notice.error ? notice.text : null}</SuccessMessage>
      </div>

      {tab === "progress" && (
        <>
          <div className="mb-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void createAll()}>
              <ClipboardList size={16} /> {t("fam.adm.createAll")}
            </Button>
          </div>
          {classes && classes.length === 0 ? (
            <EmptyState title={t("fam.adm.noClasses")} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {(classes ?? []).map((row) => (
                <ClassCard key={row.classId} row={row} ecole={ecole} onChanged={refresh} onNotice={(text, error) => setNotice({ text, error: !!error })} />
              ))}
            </div>
          )}
        </>
      )}

      {tab !== "progress" && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem]">
              <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label={t("common.class")}>
                <option value="">{t("fam.adm.allClasses")}</option>
                {(classes ?? []).map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.classe}
                  </option>
                ))}
              </Select>
            </div>
            {tab === "pending" && selectedClass && (
              <div>
                <Button type="button" disabled={busy} onClick={() => void validateSimple()}>
                  <CheckCheck size={16} /> {t("fam.adm.validateSimple", { classe: selectedClass.classe })}
                </Button>
                <p className="mt-1 max-w-md text-xs text-ink-muted">{t("fam.adm.validateSimpleHelp")}</p>
              </div>
            )}
          </div>
          {subs && subs.length === 0 ? (
            <EmptyState title={t(tab === "pending" ? "fam.adm.pendingEmpty" : "fam.adm.doneEmpty")} />
          ) : (
            <div className="space-y-4">
              {(subs ?? []).map((s) => (
                <SubmissionCard key={s.id} sub={s} classes={classes ?? []} onChanged={refresh} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
