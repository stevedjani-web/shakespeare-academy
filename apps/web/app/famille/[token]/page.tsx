"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Copy, GraduationCap, KeyRound, Phone, Plus, Send, Sparkles, Trash2, User, UserCheck } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button, ErrorMessage, Field, Input, Select, Spinner } from "@/components/ui";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { StepBar } from "@/components/pre-registration-form/parts";
import { useI18n } from "@/lib/i18n/use-i18n";
import { getLocale } from "@/lib/i18n/store";
import type { MessageKey } from "@/lib/i18n";
import { childInitials, childSwatch } from "@/lib/pre-registration-form";
import {
  EMPTY_PARENT,
  FAMILY_LINKS,
  MAX_FAMILY_CHILDREN,
  buildSubmission,
  childMissing,
  parentLoginUrl,
  parentMissing,
  passwordIssue,
  type FamilyChildForm,
  type FamilyLink,
  type FamilyParentForm,
} from "@/lib/family-collection";

interface PublicInfo {
  ecole: string;
  classe: { id: string; nom: string };
  classes: Array<{ id: string; nom: string; section: string }>;
  versionPolitique: string;
}

interface Receipt {
  recu: boolean;
  enfants: Array<{ prenom: string; nom: string; classe: string; ordre: number }>;
}

const LINK_KEY: Record<FamilyLink, MessageKey> = {
  Père: "fam.pub.rel.pere",
  Mère: "fam.pub.rel.mere",
  "Tuteur légal": "fam.pub.rel.tuteur",
  Autre: "fam.pub.rel.autre",
};

let keyCounter = 0;
const newChild = (key?: string): FamilyChildForm => ({
  key: key ?? `enfant-${++keyCounter}`,
  nom: "",
  prenom: "",
  dateNaissance: "",
  lieuNaissance: "",
  classId: "",
});

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? fallback);
  } catch {
    return fallback;
  }
}

const bad = (invalid: boolean) => (invalid ? "border-danger! bg-danger-soft/50" : "");

/**
 * Formulaire public d'une classe (D184) : le parent saisit ses informations, celles de ses enfants et un mot de passe.
 * Rien n'atteint les dossiers avant la validation du secrétariat. Aucun nom d'élève n'est affiché : le parent tape le
 * nom de son enfant, le serveur le rapproche d'un élève et le secrétariat confirme.
 */
export default function FamilyCollectionPage() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loadError, setLoadError] = useState<{ invalid: boolean; text: string } | null>(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [parent, setParent] = useState<FamilyParentForm>(EMPTY_PARENT);
  const [children, setChildren] = useState<FamilyChildForm[]>(() => [newChild("enfant-0")]);
  const [attempted, setAttempted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(attempt: number) {
      try {
        const res = await fetch(`${API_URL}/family-collection/public/${encodeURIComponent(token)}`, { headers: { "Accept-Language": getLocale() } });
        if (res.status === 404 || res.status === 410) {
          const text = await errorText(res, t("fam.pub.invalidHelp"));
          if (!cancelled) setLoadError({ invalid: true, text });
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as PublicInfo;
        if (!cancelled) setInfo(data);
      } catch {
        if (cancelled) return;
        if (attempt < 2) setTimeout(() => void load(attempt + 1), 1500);
        else setLoadError({ invalid: false, text: t("fam.pub.loadError") });
      }
    }
    void load(0);
    return () => {
      cancelled = true;
    };
    // Le jeton ne change pas pendant la vie de la page ; la langue n'a pas à relancer le chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const pMissing = parentMissing(parent);
  const cMissing = children.map((c) => childMissing(c, today));
  const pwIssue = passwordIssue(password, confirmation);

  function go(next: number) {
    setStep(next);
    setReached((r) => Math.max(r, next));
    setError(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      heading.current?.focus({ preventScroll: true });
    });
  }

  function next() {
    setAttempted(true);
    if (step === 0) {
      if (pMissing.length > 0) return setError(t("fam.pub.fixRed"));
      setAttempted(false);
      return go(1);
    }
    if (cMissing.some((m) => m.length > 0)) return setError(t("fam.pub.fixRed"));
    setAttempted(false);
    go(2);
  }

  function patchChild(key: string, patch: Partial<FamilyChildForm>) {
    setChildren((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  async function submit() {
    if (!info || pwIssue || !accepted) return;
    setError(null);
    setBusy(true);
    try {
      const body = buildSubmission(parent, children, info.classe.id, password, info.versionPolitique);
      const res = await fetch(`${API_URL}/family-collection/public/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": getLocale() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errorText(res, t("common.error")));
      setReceipt((await res.json()) as Receipt);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Le presse-papiers peut être refusé : l'adresse reste affichée et sélectionnable.
    }
  }

  const steps = [
    { label: t("fam.pub.stepYou"), icon: <User size={17} /> },
    { label: t("fam.pub.stepChildren"), icon: <GraduationCap size={17} /> },
    { label: t("fam.pub.stepReview"), icon: <ClipboardCheck size={17} /> },
  ];

  // ------------------------------------------------------------------ lien inutilisable / chargement

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <SchoolHeader title={t(loadError.invalid ? "fam.pub.invalidTitle" : "fam.pub.title")} />
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{loadError.text}</p>
        {loadError.invalid && <p className="mt-3 text-sm text-ink-muted">{t("fam.pub.invalidHelp")}</p>}
        <div className="mt-6">
          <CopyrightFooter />
        </div>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }

  const loginAddress = typeof window === "undefined" ? "" : parentLoginUrl(window.location.origin);
  const classLabel = (id: string) => info.classes.find((c) => c.id === id)?.nom ?? info.classe.nom;

  // ------------------------------------------------------------------ confirmation

  if (receipt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <div className="relative overflow-hidden rounded-3xl px-6 pb-8 pt-9 text-center text-white shadow-[var(--shadow-lift)]" style={{ background: "linear-gradient(135deg,#157a4a 0%,#0f5c38 55%,#1a8f57 100%)" }}>
          <Sparkles aria-hidden size={18} className="sa-twinkle absolute left-[12%] top-[22%] text-white/80" />
          <Sparkles aria-hidden size={14} className="sa-twinkle absolute right-[14%] top-[30%] text-accent" style={{ animationDelay: "0.8s" }} />
          <div className="relative">
            <span className="sa-pop mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-success shadow-[0_0_0_8px_rgba(255,255,255,0.18)]">
              <Check size={42} strokeWidth={3} />
            </span>
            <h1 className="mt-5 font-display text-3xl font-semibold">{t("fam.pub.sentTitle")}</h1>
            <p className="mx-auto mt-1 max-w-sm text-sm text-white/85">{t("fam.pub.sentThanks")}</p>
          </div>
        </div>

        <section className="mt-5 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.pub.sentChildren")}</p>
          <ul className="mt-3 space-y-2.5">
            {receipt.enfants.map((c, i) => {
              const sw = childSwatch(i);
              return (
                <li key={`${c.prenom}-${c.nom}-${i}`} className="sa-step-in flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${sw.border}66`, backgroundColor: sw.bg, animationDelay: `${i * 90}ms` }}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                    {childInitials(c, i)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold" style={{ color: sw.text }}>
                      {c.prenom} {c.nom}
                    </p>
                    <p className="text-sm" style={{ color: sw.text, opacity: 0.85 }}>
                      {t("fam.pub.classBadge", { classe: c.classe })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-5 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="font-display text-lg font-semibold text-ink">{t("fam.pub.nextTitle")}</p>
          <ol className="mt-3 space-y-3">
            {[
              { icon: <ClipboardCheck size={16} />, color: "var(--color-primary)", text: t("fam.pub.next1") },
              { icon: <UserCheck size={16} />, color: "var(--color-success)", text: t("fam.pub.next2") },
              { icon: <Phone size={16} />, color: "var(--color-accent-dark)", text: t("fam.pub.next3") },
            ].map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-ink">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: s.color }}>
                  {s.icon}
                </span>
                {s.text}
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.pub.loginAddress")}</p>
          <div className="mt-1.5 flex flex-col gap-2 rounded-2xl bg-surface-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-all font-mono text-sm text-primary">{loginAddress}</span>
            <button type="button" onClick={() => void copyAddress(loginAddress)} className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t("fam.pub.copied") : t("fam.pub.copyAddress")}
            </button>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href="/parents/connexion" className="sa-interactive inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:bg-primary-dark">
              {t("fam.pub.goLogin")} <ArrowRight size={16} />
            </Link>
            <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => window.location.reload()}>
              <Plus size={16} /> {t("fam.pub.again")}
            </Button>
          </div>
        </section>
        <div className="mt-6">
          <CopyrightFooter />
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ formulaire

  const showP = attempted && step === 0;
  const showC = attempted && step === 1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <header className="relative overflow-hidden rounded-3xl px-5 pb-5 pt-4 text-white shadow-[var(--shadow-lift)] sm:px-7 sm:pb-6 sm:pt-5" style={{ background: "linear-gradient(135deg,#2f2b78 0%,#211d5c 55%,#3d3196 100%)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{t("fam.pub.classBadge", { classe: info.classe.nom })}</span>
            <LanguageSwitcher variant="dark" />
          </div>
          <SchoolHeader tone="dark" title={t("fam.pub.title")} subtitle={t("fam.pub.subtitle")} />
          <div className="mt-5">
            <StepBar steps={steps} current={step} reached={reached} onGo={go} />
          </div>
        </div>
      </header>

      <div className="mt-5 space-y-4">
        <h2 ref={heading} tabIndex={-1} className="font-display text-xl font-semibold text-ink outline-none">
          {t(step === 0 ? "fam.pub.s1Title" : step === 1 ? "fam.pub.s2Title" : "fam.pub.s3Title")}
        </h2>
        <p className="-mt-2 text-sm text-ink-muted">{t(step === 0 ? "fam.pub.s1Hint" : step === 1 ? "fam.pub.s2Hint" : "fam.pub.s3Hint")}</p>
        <ErrorMessage>{error}</ErrorMessage>

        {step === 0 && (
          <section className="sa-step-in space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fam.pub.firstName")}>
                <Input autoComplete="given-name" value={parent.prenom} onChange={(e) => setParent({ ...parent, prenom: e.target.value })} className={bad(showP && pMissing.includes("prenom"))} />
              </Field>
              <Field label={t("fam.pub.lastName")}>
                <Input autoComplete="family-name" value={parent.nom} onChange={(e) => setParent({ ...parent, nom: e.target.value })} className={bad(showP && pMissing.includes("nom"))} />
              </Field>
            </div>
            <Field label={t("fam.pub.phone")}>
              <Input type="tel" inputMode="tel" autoComplete="tel" value={parent.telephone} onChange={(e) => setParent({ ...parent, telephone: e.target.value })} className={bad(showP && pMissing.includes("telephone"))} />
              <p className="mt-1 text-xs text-ink-muted">{t("fam.pub.phoneHint")}</p>
            </Field>
            <div>
              <p className={`mb-1.5 text-sm font-medium ${showP && pMissing.includes("lien") ? "text-danger" : "text-ink"}`}>{t("fam.pub.relation")}</p>
              <div role="radiogroup" aria-label={t("fam.pub.relation")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FAMILY_LINKS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={parent.lien === l}
                    onClick={() => setParent({ ...parent, lien: l })}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${parent.lien === l ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:border-primary/50"}`}
                  >
                    {t(LINK_KEY[l])}
                  </button>
                ))}
              </div>
            </div>
            <Field label={t("fam.pub.email")}>
              <Input type="email" inputMode="email" autoComplete="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} className={bad(showP && pMissing.includes("email"))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fam.pub.profession")}>
                <Input value={parent.profession} onChange={(e) => setParent({ ...parent, profession: e.target.value })} />
              </Field>
              <Field label={t("fam.pub.address")}>
                <Input autoComplete="street-address" value={parent.adresse} onChange={(e) => setParent({ ...parent, adresse: e.target.value })} />
              </Field>
            </div>
          </section>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {children.map((c, i) => {
              const sw = childSwatch(i);
              const missing = cMissing[i];
              return (
                <section key={c.key} className="sa-step-in rounded-3xl border p-5 shadow-[var(--shadow-soft)]" style={{ borderColor: `${sw.border}77`, backgroundColor: sw.bg }}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                        {childInitials(c, i)}
                      </span>
                      <p className="font-display text-base font-semibold" style={{ color: sw.text }}>
                        {t("fam.pub.childN", { n: i + 1 })}
                      </p>
                    </div>
                    {children.length > 1 && (
                      <button type="button" onClick={() => setChildren((list) => list.filter((x) => x.key !== c.key))} className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-white">
                        <Trash2 size={13} /> {t("fam.pub.removeChild")}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3 rounded-2xl bg-white/70 p-3.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t("fam.pub.childFirst")}>
                        <Input value={c.prenom} onChange={(e) => patchChild(c.key, { prenom: e.target.value })} className={bad(showC && missing.includes("prenom"))} />
                      </Field>
                      <Field label={t("fam.pub.childLast")}>
                        <Input value={c.nom} onChange={(e) => patchChild(c.key, { nom: e.target.value })} className={bad(showC && missing.includes("nom"))} />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t("fam.pub.birth")}>
                        <Input type="date" min="1990-01-01" max={today} value={c.dateNaissance} onChange={(e) => patchChild(c.key, { dateNaissance: e.target.value })} className={bad(showC && missing.includes("dateNaissance"))} />
                      </Field>
                      <Field label={t("fam.pub.birthPlace")}>
                        <Input value={c.lieuNaissance} onChange={(e) => patchChild(c.key, { lieuNaissance: e.target.value })} />
                      </Field>
                    </div>
                    <Field label={t("fam.pub.childClass")}>
                      <Select value={c.classId || info.classe.id} onChange={(e) => patchChild(c.key, { classId: e.target.value })}>
                        {info.classes.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.nom} · {k.section}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </section>
              );
            })}
            {children.length < MAX_FAMILY_CHILDREN ? (
              <button type="button" onClick={() => setChildren((list) => [...list, newChild()])} className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary/40 bg-primary-soft/40 px-4 py-4 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-soft">
                <Plus size={18} /> {t("fam.pub.addChild")}
              </button>
            ) : (
              <p className="text-center text-sm text-ink-muted">{t("fam.pub.maxChildren")}</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="sa-step-in space-y-4">
            <section className="rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.pub.recapYou")}</p>
                <button type="button" onClick={() => go(0)} className="text-xs font-semibold text-primary underline">
                  {t("fam.pub.edit")}
                </button>
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-ink">
                {parent.prenom} {parent.nom}
              </p>
              <p className="text-sm text-ink-muted">
                {parent.lien && t(LINK_KEY[parent.lien])} · {parent.telephone}
                {parent.email && ` · ${parent.email}`}
              </p>
            </section>
            <section className="rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.pub.recapChildren")}</p>
                <button type="button" onClick={() => go(1)} className="text-xs font-semibold text-primary underline">
                  {t("fam.pub.edit")}
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {children.map((c, i) => {
                  const sw = childSwatch(i);
                  return (
                    <li key={c.key} className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${sw.border}66`, backgroundColor: sw.bg }}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                        {childInitials(c, i)}
                      </span>
                      <div className="min-w-0 text-sm" style={{ color: sw.text }}>
                        <p className="font-semibold">
                          {c.prenom} {c.nom}
                        </p>
                        <p className="opacity-85">
                          {classLabel(c.classId || info.classe.id)} · {c.dateNaissance}
                          {c.lieuNaissance && ` · ${c.lieuNaissance}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-ink">
                <KeyRound size={18} className="text-primary" />
                <p className="font-display text-base font-semibold">{t("fam.pub.password")}</p>
              </div>
              <Field label={t("fam.pub.password")}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {password !== "" && pwIssue === "short" && <p className="text-sm text-danger">{t("fam.pub.passwordShort")}</p>}
              <Field label={t("fam.pub.passwordConfirm")}>
                <Input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              </Field>
              {confirmation !== "" && pwIssue === "mismatch" && <p className="text-sm text-danger">{t("fam.pub.passwordMismatch")}</p>}
              <label className="flex items-start gap-2.5 rounded-xl bg-surface-muted p-3 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>
                  {t("fam.pub.consentBefore")}
                  <Link href="/parents/confidentialite" target="_blank" className="font-medium text-primary underline">
                    {t("fam.pub.consentLink")}
                  </Link>
                  {t("fam.pub.consentAfter")}
                </span>
              </label>
              <p className="text-xs text-ink-muted">{t("fam.pub.noFees")}</p>
            </section>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={() => go(step - 1)}>
              <ArrowLeft size={16} /> {t("fam.pub.back")}
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button type="button" onClick={next}>
              {t("fam.pub.next")} <ArrowRight size={16} />
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} disabled={busy || pwIssue !== null || !accepted}>
              {busy ? <Spinner /> : <Send size={16} />} {t("fam.pub.send")}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-8">
        <CopyrightFooter />
      </div>
    </div>
  );
}
