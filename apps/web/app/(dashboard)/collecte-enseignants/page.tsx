"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Check, CheckCheck, Copy, Hourglass, Link2, Lock, LockOpen, RefreshCw, TimerReset, UserCheck, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useSchoolBrand } from "@/lib/school-brand";
import { useAuthImage } from "@/lib/use-auth-image";
import { Badge, Button, Card, EmptyState, ErrorMessage, PageTitle, Select, StatCard, SuccessMessage } from "@/components/ui";
import {
  blockingAlert,
  confirmationAlerts,
  teacherFormUrl,
  teacherShareMessage,
  type TeacherAnalysis,
  type TeacherLinkView,
  type TeacherStatusRow,
  type TeacherSubmissionView,
} from "@/lib/teacher-onboarding";

type Tab = "pending" | "done" | "tracking";

const alertColor = { BLOQUANT: "red", CONFIRMATION: "orange", INFO: "blue" } as const;

function Thumb({ path }: { path: string | null }) {
  const src = useAuthImage(path);
  if (!path) return null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-20 w-[60px] shrink-0 rounded-lg border border-border object-cover" />
  ) : (
    <span className="flex h-20 w-[60px] shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-ink-muted">
      <Camera size={18} aria-hidden />
    </span>
  );
}

// ---------------------------------------------------------------------------------------------- lien

function LinkCard({ link, onChanged }: { link: TeacherLinkView | null; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const { brand } = useSchoolBrand({ withLogo: false });
  const ecole = brand?.nom ?? "Shakespeare Academy";
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"message" | "link" | null>(null);
  const url = link && typeof window !== "undefined" ? teacherFormUrl(window.location.origin, link.token) : "";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.error"));
    }
  }

  async function copy(text: string, kind: "message" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Le presse-papiers peut être refusé : l'adresse reste affichée et sélectionnable.
    }
  }

  const state = !link ? "none" : !link.actif ? "closed" : link.expire ? "expired" : "active";
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Link2 size={18} className="text-primary" /> {t("tco.adm.link.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {state === "none" && t("tco.adm.link.none")}
            {state === "active" && t("tco.adm.link.active", { date: formatDate(link!.expiresAt) })}
            {state === "closed" && t("tco.adm.link.closed")}
            {state === "expired" && t("tco.adm.link.expired", { date: formatDate(link!.expiresAt) })}
          </p>
        </div>
        {state === "none" && (
          <Button onClick={() => void run(() => api.post("/teacher-onboarding/link", {}))}>
            <Link2 size={15} /> {t("tco.adm.link.create")}
          </Button>
        )}
      </div>
      {link && (
        <>
          <p className="mt-3 break-all rounded-xl bg-surface-muted px-3 py-2 font-mono text-xs text-ink">{url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void copy(teacherShareMessage(url, ecole), "message")} disabled={state !== "active"}>
              {copied === "message" ? <Check size={15} /> : <Copy size={15} />} {copied === "message" ? t("tco.adm.link.copied") : t("tco.adm.link.copyMessage")}
            </Button>
            <Button variant="secondary" onClick={() => void copy(url, "link")}>
              {copied === "link" ? <Check size={15} /> : <Copy size={15} />} {copied === "link" ? t("tco.adm.link.copied") : t("tco.adm.link.copyLink")}
            </Button>
            {link.actif ? (
              <Button variant="secondary" onClick={() => void run(() => api.patch("/teacher-onboarding/link", { actif: false }))}>
                <Lock size={15} /> {t("tco.adm.link.close")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void run(() => api.patch("/teacher-onboarding/link", { actif: true }))}>
                <LockOpen size={15} /> {t("tco.adm.link.reopen")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void run(() => api.patch("/teacher-onboarding/link", { prolongerJours: 30 }))}>
              <TimerReset size={15} /> {t("tco.adm.link.extend")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm(t("tco.adm.link.confirmRegenerate"))) void run(() => api.post("/teacher-onboarding/link", { regenerer: true }));
              }}
            >
              <RefreshCw size={15} /> {t("tco.adm.link.regenerate")}
            </Button>
          </div>
        </>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </Card>
  );
}

// ------------------------------------------------------------------------------------ une demande

function SubmissionCard({ sub, onProcessed }: { sub: TeacherSubmissionView; onProcessed: (message: string) => Promise<void> }) {
  const { t } = useI18n();
  const pending = sub.statut === "EN_ATTENTE";
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<TeacherAnalysis | null>(null);
  const [choice, setChoice] = useState<string>(""); // identifiant de fiche, "new" pour en créer une
  const [mode, setMode] = useState<"" | "SEANCE" | "JOURNEE">("");
  const [confirmed, setConfirmed] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (teacherId?: string) => {
      const query = teacherId && teacherId !== "new" ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
      const res = await api.get<TeacherAnalysis>(`/teacher-onboarding/submissions/${sub.id}/analyse${query}`);
      setAnalysis(res);
      return res;
    },
    [sub.id],
  );

  async function examine() {
    setError(null);
    if (open) return setOpen(false);
    try {
      const res = await load();
      setChoice(res.propose ?? "");
      setOpen(true);
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.error"));
    }
  }

  async function pick(value: string) {
    setChoice(value);
    setConfirmed(false);
    setError(null);
    try {
      await load(value || undefined);
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.error"));
    }
  }

  const alerts = analysis?.alertes ?? [];
  const blocked = blockingAlert(alerts);
  const toConfirm = confirmationAlerts(alerts);
  const canValidate = !!choice && !blocked && (toConfirm.length === 0 || confirmed);
  const name = `${sub.prenom} ${sub.nom}`;

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/teacher-onboarding/submissions/${sub.id}/valider`, {
        ...(choice === "new" ? { creerFiche: true } : { teacherId: choice }),
        ...(mode ? { modePointage: mode } : {}),
        confirmer: confirmed || undefined,
      });
      await onProcessed(t("tco.adm.validated", { name }));
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function refuse() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/teacher-onboarding/submissions/${sub.id}/refuser`, { motif: reason.trim() });
      await onProcessed(t("tco.adm.refused", { name }));
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <Thumb path={sub.photo ? `/teacher-onboarding/submissions/${sub.id}/photo` : null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{name}</p>
            <Badge color={sub.statut === "VALIDEE" ? "green" : sub.statut === "REFUSEE" ? "red" : "orange"}>{t(`tco.adm.status.${sub.statut}` as MessageKey)}</Badge>
            <span className="text-xs text-ink-muted">{t("tco.adm.sentOn", { date: formatDate(sub.createdAt) })}</span>
          </div>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-ink-muted">{t("tco.adm.phone")} : </dt>
              <dd className="inline font-medium text-ink">{sub.telephone}</dd>
            </div>
            <div>
              <dt className="inline text-ink-muted">{t("tco.adm.email")} : </dt>
              <dd className="inline font-medium text-ink">{sub.email ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline text-ink-muted">{t("tco.adm.urgence")} : </dt>
              <dd className="inline font-medium text-ink">{sub.urgenceNom || sub.urgenceTelephone ? [sub.urgenceNom, sub.urgenceTelephone].filter(Boolean).join(" · ") : "—"}</dd>
            </div>
          </dl>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-muted">{t("tco.adm.classes")} :</span>
            {sub.classes.length === 0 ? (
              <span className="text-xs text-ink-muted">{t("tco.adm.noClasses")}</span>
            ) : (
              sub.classes.map((c) => (
                <Badge key={c.id} color={c.secondaire ? "blue" : "green"}>
                  {c.nom} · {c.cycle}
                </Badge>
              ))
            )}
          </div>
          {sub.matieres.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-muted">{t("tco.adm.subjects")} :</span>
              {sub.matieres.map((m) => <Badge key={m.id} color="primary">{m.nom}</Badge>)}
            </div>
          )}
          {sub.autresMatieres.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-muted">{t("tco.adm.otherSubjects")} :</span>
              {sub.autresMatieres.map((m) => <Badge key={m} color="orange">{m}</Badge>)}
            </div>
          )}
          {sub.statut === "REFUSEE" && sub.motifRefus && <p className="mt-2 text-sm text-danger">{sub.motifRefus}</p>}
        </div>
        {pending && (
          <Button variant="secondary" onClick={() => void examine()}>
            <UserCheck size={15} /> {open ? t("tco.adm.hide") : t("tco.adm.examine")}
          </Button>
        )}
      </div>

      {pending && open && analysis && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">{t("tco.adm.link.candidates")}</p>
            <div className="space-y-2">
              {analysis.candidats.map((c) => (
                <label key={c.id} className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${choice === c.id ? "border-primary bg-primary-soft" : "border-border"}`}>
                  <input type="radio" name={`fiche-${sub.id}`} checked={choice === c.id} onChange={() => void pick(c.id)} />
                  <span className="font-medium text-ink">
                    {c.prenom} {c.nom}
                  </span>
                  <Badge color={c.correspondance === "EXACT" ? "green" : "orange"}>{t(`tco.adm.match.${c.correspondance}` as MessageKey)}</Badge>
                  {c.aCompte && <Badge color="red">{t("tco.adm.cand.hasAccount")}</Badge>}
                  {!c.telephone && <span className="text-xs text-ink-muted">{t("tco.adm.cand.noPhone")}</span>}
                </label>
              ))}
              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${choice === "new" ? "border-primary bg-primary-soft" : "border-border"}`}>
                <input type="radio" name={`fiche-${sub.id}`} checked={choice === "new"} onChange={() => void pick("new")} />
                <UserPlus size={15} aria-hidden /> <span className="font-medium text-ink">{t("tco.adm.cand.new")}</span>
              </label>
            </div>
          </div>

          <div className="max-w-sm">
            <span className="mb-1 block text-sm font-medium text-ink">{t("tco.adm.mode")}</span>
            <Select value={mode} onChange={(e) => setMode(e.target.value as "" | "SEANCE" | "JOURNEE")}>
              <option value="">{t("tco.adm.mode.keep")}</option>
              <option value="SEANCE">{t("tco.adm.mode.SEANCE")}</option>
              <option value="JOURNEE">{t("tco.adm.mode.JOURNEE")}</option>
            </Select>
          </div>

          {alerts.length > 0 && choice && (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.code} className="flex items-start gap-2 text-sm">
                  <Badge color={alertColor[a.gravite]}>{a.gravite === "BLOQUANT" ? "!" : a.gravite === "CONFIRMATION" ? "?" : "i"}</Badge>
                  <span className="text-ink">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
          {toConfirm.length > 0 && choice && !blocked && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t("tco.adm.alert.confirm")}
            </label>
          )}

          <ErrorMessage>{error}</ErrorMessage>
          {refusing ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink" htmlFor={`motif-${sub.id}`}>
                {t("tco.adm.refuse.reason")}
              </label>
              <textarea id={`motif-${sub.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink" />
              <div className="flex gap-2">
                <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void refuse()}>
                  <X size={15} /> {t("tco.adm.refuse.confirm")}
                </Button>
                <Button variant="secondary" onClick={() => setRefusing(false)}>
                  {t("tco.adm.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !canValidate} onClick={() => void validate()}>
                <CheckCheck size={15} /> {t("tco.adm.validate")}
              </Button>
              <Button variant="secondary" onClick={() => setRefusing(true)}>
                <X size={15} /> {t("tco.adm.refuse")}
              </Button>
            </div>
          )}
        </div>
      )}
      {!open && <ErrorMessage>{error}</ErrorMessage>}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ page

export default function TeacherCollectionPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("pending");
  const [link, setLink] = useState<TeacherLinkView | null | undefined>(undefined);
  const [pending, setPending] = useState<TeacherSubmissionView[] | null>(null);
  const [done, setDone] = useState<TeacherSubmissionView[] | null>(null);
  const [tracking, setTracking] = useState<TeacherStatusRow[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [l, p, d, tr] = await Promise.all([
        api.get<TeacherLinkView | null>("/teacher-onboarding/link"),
        api.get<TeacherSubmissionView[]>("/teacher-onboarding/submissions?statut=EN_ATTENTE"),
        api.get<TeacherSubmissionView[]>("/teacher-onboarding/submissions?statut=TRAITEES"),
        api.get<TeacherStatusRow[]>("/teacher-onboarding/teachers"),
      ]);
      setLink(l ?? null);
      setPending(p);
      setDone(d);
      setTracking(tr);
      setError(null);
    } catch (e) {
      setError(isApiError(e) ? e.message : t("common.error"));
    }
    // `t` change avec la langue : le rechargement n'a pas à suivre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function processed(message: string) {
    setNotice(message);
    await loadAll();
  }

  const withoutAccount = (tracking ?? []).filter((r) => r.statut === "ACTIF" && !r.aCompte).length;
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "pending", label: t("tco.adm.tab.pending", { n: pending?.length ?? 0 }) },
    { key: "done", label: t("tco.adm.tab.done") },
    { key: "tracking", label: t("tco.adm.tab.tracking") },
  ];

  return (
    <div>
      <PageTitle eyebrow={t("tco.adm.eyebrow")} subtitle={t("tco.adm.subtitle")} helpId="collecte-enseignants">
        {t("tco.adm.title")}
      </PageTitle>

      <ErrorMessage>{error}</ErrorMessage>
      {link !== undefined && <LinkCard link={link} onChanged={loadAll} />}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("tco.adm.stat.pending")} value={pending?.length ?? 0} icon={<Hourglass size={18} />} tone="warning" />
        <StatCard label={t("tco.adm.stat.accounts")} value={(tracking ?? []).filter((r) => r.aCompte).length} icon={<UserCheck size={18} />} tone="success" />
        <StatCard label={t("tco.adm.stat.missing")} value={withoutAccount} icon={<UserPlus size={18} />} tone={withoutAccount > 0 ? "danger" : "info"} />
      </div>

      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface-muted p-1">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === x.key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <SuccessMessage>{notice}</SuccessMessage>

      {tab === "pending" &&
        (pending && pending.length > 0 ? (
          <div className="space-y-3">
            {pending.map((s) => (
              <SubmissionCard key={s.id} sub={s} onProcessed={processed} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<CheckCheck />} title={t("tco.adm.pending.empty")} description="" />
        ))}

      {tab === "done" &&
        (done && done.length > 0 ? (
          <div className="space-y-3">
            {done.map((s) => (
              <SubmissionCard key={s.id} sub={s} onProcessed={processed} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Hourglass />} title={t("tco.adm.done.empty")} description="" />
        ))}

      {tab === "tracking" && (
        <Card>
          <p className="mb-3 text-sm text-ink-muted">{t("tco.adm.tracking.hint")}</p>
          {tracking && tracking.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-2 pr-4">{t("tco.adm.tracking.name")}</th>
                    <th className="py-2 pr-4">{t("tco.adm.tracking.account")}</th>
                    <th className="py-2 pr-4">{t("tco.adm.tracking.phone")}</th>
                    <th className="py-2 pr-4">{t("tco.adm.tracking.photo")}</th>
                    <th className="py-2 pr-4">{t("tco.adm.tracking.pending")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tracking.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-medium text-ink">
                        {r.prenom} {r.nom} {r.statut !== "ACTIF" && <Badge color="gray">{t("tco.adm.tracking.inactive")}</Badge>}
                      </td>
                      <td className="py-2 pr-4">{r.aCompte ? <Badge color="green">✓</Badge> : <Badge color="red">✗</Badge>}</td>
                      <td className="py-2 pr-4">{r.aTelephone ? <Badge color="green">✓</Badge> : <Badge color="orange">✗</Badge>}</td>
                      <td className="py-2 pr-4">{r.aPhoto ? <Badge color="green">✓</Badge> : <Badge color="gray">—</Badge>}</td>
                      <td className="py-2 pr-4">{r.demandeEnAttente ? <Badge color="orange">{t("tco.adm.status.EN_ATTENTE")}</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<UserCheck />} title={t("tco.adm.tracking.empty")} description="" />
          )}
        </Card>
      )}
    </div>
  );
}
