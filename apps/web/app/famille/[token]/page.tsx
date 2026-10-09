"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  ClipboardCheck,
  Clock,
  Copy,
  GraduationCap,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserRound,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button, ErrorMessage, Select, Spinner } from "@/components/ui";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { StepBar } from "@/components/pre-registration-form/parts";
import { BirthDateField, FieldError, IconInput, PasswordField } from "@/components/family-form/fields";
import { Confetti } from "@/components/family-form/confetti";
import { PhotoCropper } from "@/components/family-form/photo-cropper";
import { StudentCardPreview } from "@/components/family-form/student-card-preview";
import { useI18n } from "@/lib/i18n/use-i18n";
import { getLocale } from "@/lib/i18n/store";
import type { MessageKey } from "@/lib/i18n";
import { childInitials, childSwatch } from "@/lib/pre-registration-form";
import { formatDate } from "@/lib/format";
import {
  EMPTY_PARENT,
  FAMILY_LINKS,
  MAX_FAMILY_CHILDREN,
  buildFormData,
  buildSubmission,
  childMissing,
  parentLoginUrl,
  parentMissing,
  passwordIssue,
  phoneIsPlausible,
  type FamilyChildForm,
  type FamilyLink,
  type FamilyParentForm,
} from "@/lib/family-collection";
import { PHOTO_MAX_SOURCE_BYTES, draftKey, looksLikeImage, parseDraft, serializeDraft } from "@/lib/family-form";

interface PublicInfo {
  ecole: string;
  classe: { id: string; nom: string };
  classes: Array<{ id: string; nom: string; section: string }>;
  versionPolitique: string;
}

interface Receipt {
  recu: boolean;
  enfants: Array<{ prenom: string; nom: string; classe: string; ordre: number; photo: boolean }>;
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
  photo: null,
  photoUrl: null,
  photoSource: null,
});

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? fallback);
  } catch {
    return fallback;
  }
}

/** Titre d'une étape : une icône colorée, une question courte et une phrase d'aide. */
function StepIntro({ icon, color, title, hint, headingRef }: { icon: React.ReactNode; color: string; title: string; hint: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="flex items-start gap-3">
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

const CARD = "rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]";

/**
 * Formulaire public d'une classe (D184) : le parent saisit ses informations, celles de ses enfants (avec, s'il le veut,
 * une photo d'identité) et un mot de passe. Rien n'atteint les dossiers avant la validation du secrétariat. Aucun nom
 * d'élève n'est affiché : le parent tape le nom de son enfant, le serveur le rapproche d'un élève et le secrétariat
 * confirme. La saisie est gardée sur l'appareil (jamais le mot de passe ni les photos) : un rechargement ne fait rien perdre.
 */
export default function FamilyCollectionPage() {
  const { t, locale } = useI18n();
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
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);
  const [crop, setCrop] = useState<{ key: string; file: Blob } | null>(null);
  const [draftFound, setDraftFound] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);
  const latestChildren = useRef(children);
  useEffect(() => {
    latestChildren.current = children;
  });

  // Les adresses locales des aperçus de photo sont libérées à la fermeture de la page.
  useEffect(
    () => () => {
      latestChildren.current.forEach((c) => c.photoUrl && URL.revokeObjectURL(c.photoUrl));
    },
    [],
  );

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

  // Brouillon : relu une seule fois, dès que la liste des classes est connue.
  useEffect(() => {
    if (!info || restored.current) return;
    restored.current = true;
    try {
      const draft = parseDraft(window.localStorage.getItem(draftKey(token)), MAX_FAMILY_CHILDREN);
      if (!draft) return;
      const known = new Set(info.classes.map((c) => c.id));
      setParent({ ...EMPTY_PARENT, ...draft.parent, lien: (FAMILY_LINKS as readonly string[]).includes(draft.parent.lien) ? (draft.parent.lien as FamilyLink) : "" });
      setChildren(draft.children.map((c, i) => ({ ...newChild(i === 0 ? "enfant-0" : undefined), nom: c.nom, prenom: c.prenom, dateNaissance: c.dateNaissance, lieuNaissance: c.lieuNaissance, classId: known.has(c.classId) ? c.classId : "" })));
      setStep(draft.step);
      setReached(draft.step);
      setDraftFound(true);
    } catch {
      // Stockage indisponible (navigation privée) : on repart d'un formulaire vide.
    }
  }, [info, token]);

  // Brouillon : enregistré peu après chaque changement. Sans le mot de passe ni les photos.
  useEffect(() => {
    if (!restored.current || receipt) return;
    const timer = setTimeout(() => {
      try {
        const empty = Object.values(parent).every((v) => v === "") && children.every((c) => !c.nom && !c.prenom && !c.dateNaissance && !c.lieuNaissance && !c.classId);
        if (empty) window.localStorage.removeItem(draftKey(token));
        else window.localStorage.setItem(draftKey(token), serializeDraft({ parent, children: children.map((c) => ({ nom: c.nom, prenom: c.prenom, dateNaissance: c.dateNaissance, lieuNaissance: c.lieuNaissance, classId: c.classId })), step }));
      } catch {
        // Stockage plein ou refusé : le formulaire marche pareil, sans brouillon.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [parent, children, step, token, receipt]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey(token));
    } catch {
      // sans effet
    }
    children.forEach((c) => c.photoUrl && URL.revokeObjectURL(c.photoUrl));
    setParent(EMPTY_PARENT);
    setChildren([newChild("enfant-0")]);
    setStep(0);
    setReached(0);
    setDraftFound(false);
    setAttempted(false);
  }

  // ------------------------------------------------------------------ erreurs et progression

  const pMissing = parentMissing(parent);
  const cMissing = children.map((c) => childMissing(c, today));
  const pwIssue = passwordIssue(password, confirmation);

  const parentError = (field: "nom" | "prenom" | "telephone" | "email" | "lien"): string | null => {
    if (!attempted || step !== 0 || !pMissing.includes(field)) return null;
    if (field === "telephone") return parent.telephone.trim() ? t("fam.pub.err.phone") : t("fam.pub.err.required");
    if (field === "email") return t("fam.pub.err.email");
    if (field === "lien") return t("fam.pub.err.relation");
    return t("fam.pub.err.required");
  };
  const childError = (i: number, field: "nom" | "prenom" | "dateNaissance"): string | null => {
    if (!attempted || step !== 1 || !cMissing[i].includes(field)) return null;
    return field === "dateNaissance" ? t("fam.pub.err.birth") : t("fam.pub.err.required");
  };
  const passwordError = attempted && step === 2 && password.length < 8 ? t("fam.pub.passwordShort") : null;
  const confirmError = confirmation !== "" && pwIssue === "mismatch" ? t("fam.pub.passwordMismatch") : null;
  const consentError = attempted && step === 2 && !accepted ? t("fam.pub.err.consent") : null;

  const percent = (() => {
    const frac =
      step === 0
        ? [parent.prenom.trim(), parent.nom.trim(), phoneIsPlausible(parent.telephone), parent.lien].filter(Boolean).length / 4
        : step === 1
          ? children.reduce((n, c, i) => n + (3 - cMissing[i].length), 0) / (3 * children.length)
          : [password.length >= 8, confirmation !== "" && confirmation === password, accepted].filter(Boolean).length / 3;
    return Math.round(((step + frac) / 3) * 100);
  })();

  function focusFirstInvalid(ids: string[]) {
    requestAnimationFrame(() => {
      const el = ids.map((id) => document.getElementById(id)).find(Boolean);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | undefined)?.focus({ preventScroll: true });
    });
  }

  function go(next: number) {
    setStep(next);
    setReached((r) => Math.max(r, next));
    setError(null);
    setAttempted(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      heading.current?.focus({ preventScroll: true });
    });
  }

  function next() {
    setAttempted(true);
    if (step === 0) {
      if (pMissing.length > 0) {
        setError(t("fam.pub.fixRed"));
        const order = [
          ["prenom", "p-prenom"],
          ["nom", "p-nom"],
          ["telephone", "p-tel"],
          ["lien", "p-lien-0"],
          ["email", "p-email"],
        ] as const;
        return focusFirstInvalid(order.filter(([f]) => pMissing.includes(f)).map(([, id]) => id));
      }
      return go(1);
    }
    const bad = children.findIndex((_, i) => cMissing[i].length > 0);
    if (bad >= 0) {
      setError(t("fam.pub.fixRed"));
      const c = children[bad];
      const m = cMissing[bad];
      return focusFirstInvalid([m.includes("prenom") && `c-${c.key}-prenom`, m.includes("nom") && `c-${c.key}-nom`, m.includes("dateNaissance") && `c-${c.key}-date-d`].filter(Boolean) as string[]);
    }
    go(2);
  }

  // ------------------------------------------------------------------ enfants et photos

  function patchChild(key: string, patch: Partial<FamilyChildForm>) {
    setChildren((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function addChild() {
    const created = newChild();
    setChildren((list) => [...list, created]);
    setError(null);
    requestAnimationFrame(() => document.querySelector(`[data-child="${created.key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function removeChild(key: string) {
    const gone = children.find((c) => c.key === key);
    if (gone?.photoUrl) URL.revokeObjectURL(gone.photoUrl);
    setChildren((list) => list.filter((c) => c.key !== key));
  }

  function pickPhoto(key: string, file: File) {
    if (!looksLikeImage(file)) return setPhotoNotice(t("fam.pub.photo.badType"));
    if (file.size > PHOTO_MAX_SOURCE_BYTES) return setPhotoNotice(t("fam.pub.photo.tooBig"));
    setPhotoNotice(null);
    setCrop({ key, file });
  }

  function cropDone(blob: Blob) {
    if (!crop) return;
    const current = children.find((c) => c.key === crop.key);
    if (current?.photoUrl) URL.revokeObjectURL(current.photoUrl);
    patchChild(crop.key, { photo: blob, photoUrl: URL.createObjectURL(blob), photoSource: crop.file });
    setCrop(null);
  }

  function removePhoto(key: string) {
    const current = children.find((c) => c.key === key);
    if (current?.photoUrl) URL.revokeObjectURL(current.photoUrl);
    patchChild(key, { photo: null, photoUrl: null, photoSource: null });
  }

  // ------------------------------------------------------------------ envoi

  async function submit() {
    if (!info) return;
    setAttempted(true);
    if (pwIssue || !accepted) {
      setError(t("fam.pub.fixRed"));
      return focusFirstInvalid([password.length < 8 ? "f-password" : pwIssue ? "f-confirm" : "f-consent"]);
    }
    setError(null);
    setBusy(true);
    try {
      const payload = buildSubmission(parent, children, info.classe.id, password, info.versionPolitique);
      const res = await fetch(`${API_URL}/family-collection/public/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Accept-Language": getLocale() },
        body: buildFormData(payload, children),
      });
      if (!res.ok) throw new Error(await errorText(res, t("common.error")));
      setReceipt((await res.json()) as Receipt);
      try {
        window.localStorage.removeItem(draftKey(token));
      } catch {
        // sans effet
      }
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (err) {
      setError(err instanceof TypeError ? t("fam.pub.loadError") : err instanceof Error ? err.message : t("common.error"));
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
          <Confetti />
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

        <section className={`mt-5 ${CARD}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("fam.pub.sentChildren")}</p>
          <ul className="mt-3 space-y-2.5">
            {receipt.enfants.map((c, i) => {
              const sw = childSwatch(i);
              const local = children[c.ordre];
              return (
                <li key={`${c.prenom}-${c.nom}-${i}`} className="sa-step-in flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${sw.border}66`, backgroundColor: sw.bg, animationDelay: `${i * 90}ms` }}>
                  {local?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={local.photoUrl} alt="" className="h-14 w-[42px] shrink-0 rounded-lg object-cover" style={{ boxShadow: `0 0 0 2px ${sw.border}` }} />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                      {childInitials(c, i)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold" style={{ color: sw.text }}>
                      {c.prenom} {c.nom}
                    </p>
                    <p className="text-sm" style={{ color: sw.text, opacity: 0.85 }}>
                      {t("fam.pub.classBadge", { classe: c.classe })}
                      {c.photo && ` · ${t("fam.pub.sentPhoto")}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={`mt-5 ${CARD}`}>
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-32 sm:py-8 sm:pb-10">
      <header className="relative overflow-hidden rounded-3xl px-5 pb-5 pt-4 text-white shadow-[var(--shadow-lift)] sm:px-7 sm:pb-6 sm:pt-5" style={{ background: "linear-gradient(135deg,#2f2b78 0%,#211d5c 55%,#3d3196 100%)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
        <Sparkles aria-hidden size={16} className="sa-twinkle absolute right-[22%] top-[26%] hidden text-accent/80 sm:block" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{t("fam.pub.classBadge", { classe: info.classe.nom })}</span>
            <LanguageSwitcher variant="dark" />
          </div>
          <SchoolHeader tone="dark" title={t("fam.pub.title")} subtitle={t("fam.pub.subtitle")} />
          <div className="mt-5">
            <StepBar steps={steps} current={step} reached={reached} onGo={go} />
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs text-white/80">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{t("fam.pub.progress", { pct: percent })}</span>
            <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
              <Clock size={12} /> {t("fam.pub.time")}
            </span>
          </div>
        </div>
      </header>

      {draftFound && (
        <div className="sa-step-in mt-4 flex items-start gap-3 rounded-2xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-info" role="status">
          <RotateCcw size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p className="flex-1">{t("fam.pub.draft.found")}</p>
          <button type="button" onClick={clearDraft} className="shrink-0 font-semibold underline">
            {t("fam.pub.draft.clear")}
          </button>
        </div>
      )}

      <form
        id="family-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) next();
          else void submit();
        }}
        className="mt-5 space-y-4"
      >
        <StepIntro
          headingRef={heading}
          icon={step === 0 ? <User size={22} /> : step === 1 ? <GraduationCap size={22} /> : <ClipboardCheck size={22} />}
          color={step === 0 ? "var(--color-primary)" : step === 1 ? "var(--color-accent-dark)" : "var(--color-success)"}
          title={t(step === 0 ? "fam.pub.s1Title" : step === 1 ? "fam.pub.s2Title" : "fam.pub.s3Title")}
          hint={t(step === 0 ? "fam.pub.s1Hint" : step === 1 ? "fam.pub.s2Hint" : "fam.pub.s3Hint")}
        />
        <ErrorMessage>{error}</ErrorMessage>
        <ErrorMessage>{photoNotice}</ErrorMessage>

        {step === 0 && (
          <section key="s0" className={`sa-step-in space-y-4 ${CARD}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <IconInput id="p-prenom" label={t("fam.pub.firstName")} icon={<UserRound size={18} />} autoComplete="given-name" value={parent.prenom} onChange={(v) => setParent({ ...parent, prenom: v })} error={parentError("prenom")} />
              <IconInput id="p-nom" label={t("fam.pub.lastName")} icon={<UserRound size={18} />} autoComplete="family-name" value={parent.nom} onChange={(v) => setParent({ ...parent, nom: v })} error={parentError("nom")} />
            </div>
            <IconInput id="p-tel" label={t("fam.pub.phone")} icon={<Phone size={18} />} type="tel" inputMode="tel" autoComplete="tel" placeholder="06 123 45 67" value={parent.telephone} onChange={(v) => setParent({ ...parent, telephone: v })} error={parentError("telephone")} hint={t("fam.pub.phoneHint")} />
            <div>
              <p className={`mb-1.5 text-sm font-medium ${parentError("lien") ? "text-danger" : "text-ink"}`}>{t("fam.pub.relation")}</p>
              <div role="radiogroup" aria-label={t("fam.pub.relation")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FAMILY_LINKS.map((l, i) => (
                  <button
                    key={l}
                    id={`p-lien-${i}`}
                    type="button"
                    role="radio"
                    aria-checked={parent.lien === l}
                    onClick={() => setParent({ ...parent, lien: l })}
                    className={`sa-interactive inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${parent.lien === l ? "border-primary bg-primary text-white shadow-[var(--shadow-soft)]" : parentError("lien") ? "border-danger bg-danger-soft/40 text-ink" : "border-border bg-surface text-ink hover:border-primary/50"}`}
                  >
                    {parent.lien === l && <Check size={15} strokeWidth={3} />}
                    {t(LINK_KEY[l])}
                  </button>
                ))}
              </div>
              <FieldError id="p-lien-error">{parentError("lien")}</FieldError>
            </div>
            <IconInput id="p-email" label={t("fam.pub.email")} icon={<Mail size={18} />} type="email" inputMode="email" autoComplete="email" value={parent.email} onChange={(v) => setParent({ ...parent, email: v })} error={parentError("email")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <IconInput id="p-prof" label={t("fam.pub.profession")} icon={<Briefcase size={18} />} value={parent.profession} onChange={(v) => setParent({ ...parent, profession: v })} />
              <IconInput id="p-adr" label={t("fam.pub.address")} icon={<MapPin size={18} />} autoComplete="street-address" value={parent.adresse} onChange={(v) => setParent({ ...parent, adresse: v })} />
            </div>
            <p className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-muted">
              <ShieldCheck size={14} className="shrink-0 text-success" aria-hidden /> {t("fam.pub.secure")}
            </p>
          </section>
        )}

        {step === 1 && (
          <div key="s1" className="space-y-5">
            {children.map((c, i) => {
              const sw = childSwatch(i);
              return (
                <section key={c.key} data-child={c.key} className="sa-step-in space-y-3 scroll-mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                        {i + 1}
                      </span>
                      <p className="font-display text-base font-semibold" style={{ color: sw.text }}>
                        {t("fam.pub.childN", { n: i + 1 })}
                      </p>
                    </div>
                    {children.length > 1 && (
                      <button type="button" onClick={() => removeChild(c.key)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:border-danger/50">
                        <Trash2 size={13} /> {t("fam.pub.removeChild")}
                      </button>
                    )}
                  </div>

                  <StudentCardPreview
                    index={i}
                    nom={c.nom}
                    prenom={c.prenom}
                    classe={classLabel(c.classId || info.classe.id)}
                    dateNaissance={c.dateNaissance}
                    school={info.ecole}
                    photoUrl={c.photoUrl}
                    onFile={(file) => pickPhoto(c.key, file)}
                    onAdjust={() => c.photoSource && setCrop({ key: c.key, file: c.photoSource })}
                    onRemove={() => removePhoto(c.key)}
                  />

                  <div className={`space-y-4 ${CARD}`}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <IconInput id={`c-${c.key}-prenom`} label={t("fam.pub.childFirst")} icon={<UserRound size={18} />} autoComplete="off" value={c.prenom} onChange={(v) => patchChild(c.key, { prenom: v })} error={childError(i, "prenom")} />
                      <IconInput id={`c-${c.key}-nom`} label={t("fam.pub.childLast")} icon={<UserRound size={18} />} autoComplete="off" value={c.nom} onChange={(v) => patchChild(c.key, { nom: v })} error={childError(i, "nom")} />
                    </div>
                    <BirthDateField id={`c-${c.key}-date`} label={t("fam.pub.birth")} value={c.dateNaissance} onChange={(iso) => patchChild(c.key, { dateNaissance: iso })} error={childError(i, "dateNaissance")} today={today} locale={locale} />
                    <IconInput id={`c-${c.key}-lieu`} label={t("fam.pub.birthPlace")} icon={<MapPin size={18} />} autoComplete="off" value={c.lieuNaissance} onChange={(v) => patchChild(c.key, { lieuNaissance: v })} />
                    <div>
                      <label htmlFor={`c-${c.key}-classe`} className="mb-1.5 block text-sm font-medium text-ink">
                        {t("fam.pub.childClass")}
                      </label>
                      <Select id={`c-${c.key}-classe`} value={c.classId || info.classe.id} onChange={(e) => patchChild(c.key, { classId: e.target.value })} className="py-3 text-base sm:text-sm">
                        {info.classes.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.nom} · {k.section}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </section>
              );
            })}
            {children.length < MAX_FAMILY_CHILDREN ? (
              <button type="button" onClick={addChild} className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary/40 bg-primary-soft/40 px-4 py-4 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-soft">
                <Plus size={18} /> {t("fam.pub.addChild")}
              </button>
            ) : (
              <p className="text-center text-sm text-ink-muted">{t("fam.pub.maxChildren")}</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div key="s2" className="sa-step-in space-y-4">
            <section className={CARD}>
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
            <section className={CARD}>
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
                      {c.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photoUrl} alt="" className="h-14 w-[42px] shrink-0 rounded-lg object-cover" style={{ boxShadow: `0 0 0 2px ${sw.border}` }} />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: sw.border }}>
                          {childInitials(c, i)}
                        </span>
                      )}
                      <div className="min-w-0 text-sm" style={{ color: sw.text }}>
                        <p className="font-semibold">
                          {c.prenom} {c.nom}
                        </p>
                        <p className="opacity-85">
                          {classLabel(c.classId || info.classe.id)} · {formatDate(c.dateNaissance)}
                          {c.lieuNaissance && ` · ${c.lieuNaissance}`}
                        </p>
                        <p className="text-xs opacity-75">{c.photo ? t("fam.pub.recap.photo") : t("fam.pub.recap.noPhoto")}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className={`space-y-4 ${CARD}`}>
              <div className="flex items-center gap-2 text-ink">
                <KeyRound size={18} className="text-primary" />
                <p className="font-display text-base font-semibold">{t("fam.pub.password")}</p>
              </div>
              <PasswordField id="f-password" label={t("fam.pub.password")} value={password} onChange={setPassword} error={passwordError} showMeter />
              <PasswordField id="f-confirm" label={t("fam.pub.passwordConfirm")} value={confirmation} onChange={setConfirmation} error={confirmError} />
              <label className="flex items-start gap-2.5 rounded-xl bg-surface-muted p-3 text-sm text-ink">
                <input id="f-consent" type="checkbox" className="mt-1 h-4 w-4" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} aria-invalid={consentError ? true : undefined} />
                <span>
                  {t("fam.pub.consentBefore")}
                  <Link href="/parents/confidentialite" target="_blank" className="font-medium text-primary underline">
                    {t("fam.pub.consentLink")}
                  </Link>
                  {t("fam.pub.consentAfter")}
                </span>
              </label>
              <FieldError id="f-consent-error">{consentError}</FieldError>
              <p className="text-xs text-ink-muted">{t("fam.pub.noFees")}</p>
            </section>
          </div>
        )}
      </form>

      {/* Barre d'actions : toujours à portée du pouce sur téléphone, dans le flux sur grand écran. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="secondary" className="py-3" onClick={() => go(step - 1)}>
              <ArrowLeft size={16} /> {t("fam.pub.back")}
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button type="submit" form="family-form" className="sa-interactive inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:bg-primary-dark sm:flex-none">
              {t("fam.pub.next")} <ArrowRight size={16} />
            </button>
          ) : (
            <button type="submit" form="family-form" disabled={busy} className="sa-interactive inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:bg-accent-dark disabled:bg-accent/40 sm:flex-none">
              {busy ? <Spinner /> : <Send size={16} />} {busy ? t("fam.pub.sending") : t("fam.pub.send")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-8">
        <CopyrightFooter />
      </div>

      {crop && <PhotoCropper file={crop.file} onCancel={() => setCrop(null)} onDone={cropDone} onUnreadable={() => {
            setCrop(null);
            setPhotoNotice(t("fam.pub.photo.unreadable"));
          }} />}
    </div>
  );
}
