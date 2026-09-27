"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Copy, FileText, GraduationCap, Mail, Pencil, Phone, Plus, Search, Send, ShieldCheck, Sparkles, User, UserCheck } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { MAX_CHILDREN, dayLabel, type SectionNode, type SubmissionReceipt } from "@/lib/pre-registrations";
import { childInitials, childMissing, childSwatch, type ChildField, type ChildForm, type ParentForm } from "@/lib/pre-registration-form";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { ChildCard, levelNameOf } from "@/components/pre-registration-form/child-card";
import { StepBar } from "@/components/pre-registration-form/parts";
import { useI18n } from "@/lib/i18n/use-i18n";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";
import { useSchoolBrand } from "@/lib/school-brand";

// La première fiche a une clé fixe (identique au rendu serveur et au rendu navigateur) ; les suivantes, ajoutées par un clic,
// reçoivent une clé unique. Un compteur global pour la première provoquerait un écart d'hydratation.
let keyCounter = 0;
const newChild = (key?: string): ChildForm => ({
  key: key ?? `enfant-${++keyCounter}`,
  nom: "",
  prenom: "",
  sexe: "",
  dateNaissance: "",
  lieuNaissance: "",
  levelId: "",
  typeEleve: "",
  ancienEtablissement: "",
  classePrecedenteLevelId: "",
  bulletin: null,
  bulletinError: null,
});

const EMPTY_PARENT: ParentForm = { nom: "", prenom: "", telephone: "", email: "" };

async function extractError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? translate("common.error"));
  } catch {
    return translate("common.error");
  }
}

/** Un nom sur une pastille colorée : le fil rouge visuel d'un enfant, de sa fiche à la confirmation. */
function Avatar({ child, index, size = "h-10 w-10" }: { child: Pick<ChildForm, "nom" | "prenom">; index: number; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm`} style={{ backgroundColor: childSwatch(index).border }}>
      {childInitials(child, index)}
    </span>
  );
}

/** Titre d'une étape : une icône colorée, une question courte et une phrase d'aide. */
function StepIntro({ icon, color, title, hint, headingRef }: { icon: React.ReactNode; color: string; title: string; hint: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: color }}>
        {icon}
      </span>
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-xl font-semibold leading-tight text-ink outline-none">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Dépôt public d'une demande de préinscription en trois étapes (parent ou tuteur, enfants, vérification) : aucun compte
 * requis. Le parent est saisi une seule fois ; chaque enfant a sa fiche (classe demandée, nouvel ou ancien élève,
 * documents). La classe réelle et l'année scolaire sont choisies par le secrétariat à l'examen, jamais ici. Aucun frais
 * n'est demandé à ce stade.
 */
export default function PreRegistrationPage() {
  const { t } = useI18n();
  const { brand } = useSchoolBrand({ withLogo: false });
  const school = brand?.nom ?? "Shakespeare Academy";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [tree, setTree] = useState<SectionNode[]>([]);
  const [parent, setParent] = useState<ParentForm>(EMPTY_PARENT);
  const [children, setChildren] = useState<ChildForm[]>(() => [newChild("enfant-0")]);
  const [openKey, setOpenKey] = useState<string | null>("enfant-0");
  // Vrai après un premier essai de « Continuer » : les champs manquants sont alors signalés, et le signalement se met à
  // jour au fil de la saisie (un champ rempli cesse aussitôt d'être en rouge).
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const top = useRef<HTMLDivElement>(null);

  // La liste des classes se charge au démarrage ; sur une connexion fragile, on réessaie deux fois avant d'abandonner.
  useEffect(() => {
    let cancelled = false;
    async function load(attempt: number) {
      try {
        const res = await fetch(`${API_URL}/preinscriptions/niveaux`);
        if (!res.ok) throw new Error();
        const levels = (await res.json()) as SectionNode[];
        if (!cancelled) setTree(levels);
      } catch {
        if (!cancelled && attempt < 2) setTimeout(() => void load(attempt + 1), 1500);
      }
    }
    void load(0);
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key: string, patch: Partial<ChildForm>) => setChildren((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  function go(next: number) {
    setError(null);
    setStep(next);
    setReached((r) => Math.max(r, next));
    // Retour en haut, puis le focus sur le titre de l'étape : la navigation reste fluide au clavier et au lecteur d'écran.
    requestAnimationFrame(() => {
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading.current?.focus({ preventScroll: true });
    });
  }

  /** Signale les fiches incomplètes (la première s'ouvre) ; renvoie vrai si tout est complet. */
  function validateChildren(): boolean {
    const first = children.find((c) => childMissing(c, today).length > 0);
    if (!first) {
      setAttempted(false);
      return true;
    }
    setAttempted(true);
    setOpenKey(first.key);
    setError(t("cnt.pre.childIncomplete", { name: `${first.prenom} ${first.nom}`.trim() || t("cnt.pre.childN", { n: children.indexOf(first) + 1 }) }));
    requestAnimationFrame(() => document.querySelector(`[data-child="${first.key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return false;
  }

  function addChild() {
    const created = newChild();
    setChildren((list) => [...list, created]);
    setOpenKey(created.key);
    setError(null);
    requestAnimationFrame(() => document.querySelector(`[data-child="${created.key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function removeChild(key: string) {
    setChildren((list) => list.filter((c) => c.key !== key));
    setOpenKey((current) => (current === key ? null : current));
  }

  async function submit() {
    setError(null);
    if (!validateChildren()) return go(1);
    setBusy(true);
    try {
      const payload = {
        responsable: {
          nom: parent.nom,
          prenom: parent.prenom,
          telephone: parent.telephone,
          email: parent.email.trim() || undefined,
        },
        message: message.trim() || undefined,
        enfants: children.map((c) => ({
          nom: c.nom,
          prenom: c.prenom,
          sexe: c.sexe,
          dateNaissance: c.dateNaissance,
          lieuNaissance: c.lieuNaissance.trim() || undefined,
          levelId: c.levelId,
          typeEleve: c.typeEleve,
          ancienEtablissement: c.typeEleve === "NOUVEAU" ? c.ancienEtablissement.trim() || undefined : undefined,
          classePrecedenteLevelId: c.typeEleve === "ANCIEN" ? c.classePrecedenteLevelId : undefined,
        })),
      };
      // Multipart : le JSON dans « payload », un fichier « bulletin_<rang> » pour chaque enfant qui joint son bulletin.
      const body = new FormData();
      body.append("payload", JSON.stringify(payload));
      children.forEach((c, i) => {
        if (c.typeEleve === "NOUVEAU" && c.bulletin) body.append(`bulletin_${i}`, c.bulletin, c.bulletin.name);
      });
      // Les messages du serveur (doublon, fichier refusé…) suivent la langue choisie sur le site, pas celle du navigateur.
      const res = await fetch(`${API_URL}/preinscriptions`, { method: "POST", body, headers: { "Accept-Language": getLocale() } });
      if (!res.ok) throw new Error(await extractError(res));
      setReceipt((await res.json()) as SubmissionReceipt);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Le presse-papiers peut être refusé : la référence reste affichée et sélectionnable.
    }
  }

  const steps = [
    { label: t("cnt.pre.stepGuardian"), icon: <User size={17} /> },
    { label: t("cnt.pre.stepChildren"), icon: <GraduationCap size={17} /> },
    { label: t("cnt.pre.stepReview"), icon: <ClipboardCheck size={17} /> },
  ];

  // ------------------------------------------------------------------ confirmation

  if (receipt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <div className="relative overflow-hidden rounded-3xl px-6 pb-8 pt-9 text-center text-white shadow-[var(--shadow-lift)]" style={{ background: "linear-gradient(135deg,#157a4a 0%,#0f5c38 55%,#1a8f57 100%)" }}>
          <div aria-hidden className="pointer-events-none absolute -left-8 -top-8 h-40 w-40 rounded-full bg-accent/40 blur-3xl" />
          <Sparkles aria-hidden size={18} className="sa-twinkle absolute left-[12%] top-[22%] text-white/80" />
          <Sparkles aria-hidden size={14} className="sa-twinkle absolute right-[14%] top-[30%] text-accent" style={{ animationDelay: "0.8s" }} />
          <Sparkles aria-hidden size={12} className="sa-twinkle absolute bottom-[18%] left-[22%] text-white/60" style={{ animationDelay: "1.4s" }} />
          <div className="relative">
            <span className="sa-pop mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-success shadow-[0_0_0_8px_rgba(255,255,255,0.18)]">
              <Check size={42} strokeWidth={3} />
            </span>
            <h1 className="mt-5 font-display text-3xl font-semibold">{t("cnt.pre.sentTitle")}</h1>
            <p className="mx-auto mt-1 max-w-sm text-sm text-white/85">{t("cnt.pre.sentThanks")}</p>
            <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-white/70">{t("cnt.pre.sentNote")}</p>
            <div className="mx-auto mt-2 flex max-w-sm items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-primary shadow-sm">
              <span className="min-w-0 truncate font-mono text-lg font-semibold tracking-wide sm:text-xl">{receipt.reference}</span>
              <button type="button" onClick={() => void copyReference(receipt.reference)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t("cnt.pre.copied") : t("cnt.pre.copyRef")}
              </button>
            </div>
          </div>
        </div>

        <section className="mt-5 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("cnt.pre.sentChildren")}</p>
          <p className="mt-1 text-sm text-ink-muted">{t("cnt.pre.recapParent", { name: `${receipt.responsable.prenom} ${receipt.responsable.nom}`, phone: parent.telephone })}</p>
          <ul className="mt-3 space-y-2.5">
            {receipt.enfants.map((c, i) => {
              const sw = childSwatch(i);
              return (
                <li key={`${c.prenom}-${c.nom}-${i}`} className="sa-step-in flex items-start gap-3 rounded-2xl border p-3" style={{ borderColor: `${sw.border}66`, backgroundColor: sw.bg, animationDelay: `${i * 90}ms` }}>
                  <Avatar child={c} index={i} size="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold" style={{ color: sw.text }}>
                      {c.prenom} {c.nom}
                    </p>
                    <p className="text-sm" style={{ color: sw.text, opacity: 0.85 }}>
                      {t("cnt.pre.trackRequested", { level: c.classeDemandee })}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-white/80 px-2.5 py-0.5 font-semibold" style={{ color: c.typeEleve === "ANCIEN" ? "var(--color-info)" : "var(--color-success)" }}>
                        {c.typeEleve === "ANCIEN" ? t("cnt.pre.kindOld", { school }) : t("cnt.pre.kindNew")}
                      </span>
                      {c.classePrecedente && <span style={{ color: sw.text }}>{t("cnt.pre.sentPrevClass", { level: c.classePrecedente })}</span>}
                      {c.ancienEtablissement && <span style={{ color: sw.text }}>{t("cnt.pre.sentPrevSchool", { school: c.ancienEtablissement })}</span>}
                      {c.bulletinJoint && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 font-semibold text-ink-muted">
                          <FileText size={11} /> {t("cnt.pre.recapReport")}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-5 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="font-display text-lg font-semibold text-ink">{t("cnt.pre.nextTitle")}</p>
          <ol className="mt-3 space-y-3">
            {[
              { icon: <Search size={16} />, color: "var(--color-primary)", text: t("cnt.pre.next1") },
              { icon: <Phone size={16} />, color: "var(--color-success)", text: t("cnt.pre.next2") },
              { icon: <UserCheck size={16} />, color: "var(--color-accent-dark)", text: t("cnt.pre.next3") },
            ].map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-ink">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: s.color }}>
                  {s.icon}
                </span>
                {s.text}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href="/preinscription/suivi" className="sa-interactive inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:bg-primary-dark">
              {t("cnt.pre.track")} <ArrowRight size={16} />
            </Link>
            <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => window.location.reload()}>
              <Plus size={16} /> {t("cnt.pre.newRequest")}
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div ref={top} className="scroll-mt-4" />
      <header className="relative overflow-hidden rounded-3xl px-5 pb-5 pt-4 text-white shadow-[var(--shadow-lift)] sm:px-7 sm:pb-6 sm:pt-5" style={{ background: "linear-gradient(135deg,#2f2b78 0%,#211d5c 55%,#3d3196 100%)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
        <Sparkles aria-hidden size={16} className="sa-twinkle absolute hidden sm:block right-[22%] top-[26%] text-accent/80" />
        <Sparkles aria-hidden size={11} className="sa-twinkle absolute hidden sm:block right-[9%] top-[58%] text-white/50" style={{ animationDelay: "1s" }} />
        <div className="relative">
          <div className="mb-3 flex justify-end">
            <LanguageSwitcher variant="dark" />
          </div>
          <SchoolHeader tone="dark" title={t("cnt.pre.title")} subtitle={t("cnt.pre.subtitle")} />
          <div className="mt-5">
            <StepBar steps={steps} current={step} reached={reached} onGo={go} />
          </div>
        </div>
      </header>

      <main key={step} className="sa-step-in mt-5">
        {/* ------------------------------------------------ étape 1 : parent ou tuteur */}
        {step === 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(1);
            }}
          >
            <StepIntro icon={<User size={22} />} color="var(--color-primary)" title={t("cnt.pre.s1Title")} hint={t("cnt.pre.guardianHint")} headingRef={heading} />
            <div className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("cnt.pre.firstName")}>
                  <Input required autoComplete="given-name" value={parent.prenom} onChange={(e) => setParent({ ...parent, prenom: e.target.value })} />
                </Field>
                <Field label={t("cnt.pre.lastName")}>
                  <Input required autoComplete="family-name" value={parent.nom} onChange={(e) => setParent({ ...parent, nom: e.target.value })} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("cnt.pre.phone")}>
                  <Input type="tel" required autoComplete="tel" inputMode="tel" value={parent.telephone} onChange={(e) => setParent({ ...parent, telephone: e.target.value })} />
                </Field>
                <Field label={t("cnt.pre.email")}>
                  <Input type="email" autoComplete="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} />
                </Field>
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-xs text-primary">
                <ShieldCheck size={15} className="mt-px shrink-0" /> {t("cnt.pre.phoneWhy")}
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="submit" className="px-6 py-3">
                {t("cnt.pre.next")} <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------ étape 2 : les enfants */}
        {step === 1 && (
          <div>
            <StepIntro icon={<GraduationCap size={22} />} color="var(--color-success)" title={t("cnt.pre.s2Title")} hint={t("cnt.pre.s2Hint")} headingRef={heading} />
            <div className="space-y-3.5">
              {children.map((child, index) => (
                <ChildCard
                  key={child.key}
                  index={index}
                  child={child}
                  tree={tree}
                  school={school}
                  today={today}
                  open={openKey === child.key}
                  errors={attempted ? new Set<ChildField>(childMissing(child, today)) : null}
                  canRemove={children.length > 1}
                  onToggle={() => setOpenKey((k) => (k === child.key ? null : child.key))}
                  onChange={(patch) => update(child.key, patch)}
                  onRemove={() => removeChild(child.key)}
                />
              ))}
              <button
                type="button"
                onClick={addChild}
                disabled={children.length >= MAX_CHILDREN}
                className="sa-interactive flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary/30 bg-primary-soft/40 px-4 py-4 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white">
                  <Plus size={16} />
                </span>
                {t("cnt.pre.addChild")}
              </button>
              {children.length >= MAX_CHILDREN && <p className="text-center text-xs text-ink-muted">{t("cnt.pre.maxChildren", { max: MAX_CHILDREN })}</p>}
            </div>
            <ErrorMessage>{attempted && children.some((c) => childMissing(c, today).length > 0) ? error : null}</ErrorMessage>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => go(0)}>
                <ArrowLeft size={16} /> {t("cnt.pre.back")}
              </Button>
              <Button
                type="button"
                className="px-6 py-3"
                onClick={() => {
                  if (validateChildren()) go(2);
                }}
              >
                {t("cnt.pre.next")} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------ étape 3 : vérification et envoi */}
        {step === 2 && (
          <div>
            <StepIntro icon={<ClipboardCheck size={22} />} color="var(--color-accent-dark)" title={t("cnt.pre.s3Title")} hint={t("cnt.pre.s3Hint")} headingRef={heading} />
            <div className="space-y-3">
              <section className="flex items-start gap-3 rounded-3xl border border-primary/20 bg-primary-soft/50 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <User size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t("cnt.pre.guardian")}</p>
                  <p className="font-display text-base font-semibold text-ink">
                    {parent.prenom} {parent.nom}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} /> {parent.telephone}
                    </span>
                    {parent.email && (
                      <span className="inline-flex items-center gap-1 break-all">
                        <Mail size={12} /> {parent.email}
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" onClick={() => go(0)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-primary hover:text-white">
                  <Pencil size={12} /> {t("cnt.pre.edit")}
                </button>
              </section>

              <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {children.length === 1 ? t("cnt.pre.recapOne") : t("cnt.pre.recapMany", { n: children.length })}
              </p>
              {children.map((c, i) => {
                const sw = childSwatch(i);
                return (
                  <section key={c.key} className="flex items-start gap-3 rounded-3xl border-2 p-4" style={{ borderColor: `${sw.border}66`, backgroundColor: sw.bg }}>
                    <Avatar child={c} index={i} size="h-11 w-11" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base font-semibold" style={{ color: sw.text }}>
                        {c.prenom} {c.nom}
                      </p>
                      <p className="text-sm" style={{ color: sw.text, opacity: 0.85 }}>
                        {t("cnt.pre.bornOn", { date: dayLabel(c.dateNaissance) })} · {c.sexe === "F" ? t("cnt.pre.female") : t("cnt.pre.male")}
                      </p>
                      <p className="mt-0.5 text-sm font-medium" style={{ color: sw.text }}>
                        {t("cnt.pre.trackRequested", { level: levelNameOf(tree, c.levelId) })}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-full bg-white/80 px-2.5 py-0.5 font-semibold" style={{ color: c.typeEleve === "ANCIEN" ? "var(--color-info)" : "var(--color-success)" }}>
                          {c.typeEleve === "ANCIEN" ? t("cnt.pre.kindOld", { school }) : t("cnt.pre.kindNew")}
                        </span>
                        {c.typeEleve === "ANCIEN" && <span style={{ color: sw.text }}>{t("cnt.pre.sentPrevClass", { level: levelNameOf(tree, c.classePrecedenteLevelId) })}</span>}
                        {c.typeEleve === "NOUVEAU" && c.ancienEtablissement.trim() && <span style={{ color: sw.text }}>{t("cnt.pre.sentPrevSchool", { school: c.ancienEtablissement.trim() })}</span>}
                        {c.typeEleve === "NOUVEAU" && c.bulletin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 font-semibold text-ink-muted">
                            <FileText size={11} /> {c.bulletin.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenKey(c.key);
                        go(1);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-sm hover:opacity-90"
                      style={{ color: sw.text }}
                    >
                      <Pencil size={12} /> {t("cnt.pre.edit")}
                    </button>
                  </section>
                );
              })}

              <div className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
                <Field label={t("cnt.pre.message")}>
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    maxLength={500}
                    placeholder={t("cnt.pre.messagePlaceholder")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </Field>
              </div>
              <p className="flex items-center justify-center gap-2 text-center text-xs font-medium text-success">
                <ShieldCheck size={14} /> {t("cnt.pre.noFee")}
              </p>
            </div>
            <ErrorMessage>{error}</ErrorMessage>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => go(1)} disabled={busy}>
                <ArrowLeft size={16} /> {t("cnt.pre.back")}
              </Button>
              <Button type="button" variant="accent" className="px-7 py-3 text-base" onClick={() => void submit()} disabled={busy}>
                {busy ? t("cnt.pre.sending") : t("cnt.pre.submit")} {!busy && <Send size={16} />}
              </Button>
            </div>
          </div>
        )}
      </main>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {t("cnt.pre.already")}{" "}
        <Link href="/preinscription/suivi" className="font-medium text-primary underline">
          {t("cnt.pre.followStatus")}
        </Link>
      </p>
      <div className="mt-6">
        <CopyrightFooter />
      </div>
    </div>
  );
}
