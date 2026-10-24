"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, Check, GraduationCap, KeyRound, Mail, Pencil, Phone, Send, ShieldCheck, User, UserRound } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { BrandMark } from "@/components/brand-mark";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FieldError, IconInput, PasswordField } from "@/components/family-form/fields";
import { Confetti } from "@/components/family-form/confetti";
import { PhotoCropper } from "@/components/family-form/photo-cropper";
import { Assistant, type AssistantTone } from "@/components/teacher-form/assistant";
import { ClassPicker } from "@/components/teacher-form/class-picker";
import { PhotoStep } from "@/components/teacher-form/photo-step";
import { SubjectPicker } from "@/components/teacher-form/subject-picker";
import { useI18n } from "@/lib/i18n/use-i18n";
import { getLocale } from "@/lib/i18n/store";
import type { MessageKey } from "@/lib/i18n";
import { PHOTO_MAX_SOURCE_BYTES, looksLikeImage } from "@/lib/family-form";
import {
  EMPTY_TEACHER_FORM,
  addOtherSubject,
  buildTeacherFormData,
  draftOf,
  firstStepWithMissing,
  missingOnStep,
  needsSubjects,
  neighbourStep,
  restoreDraft,
  selectedClassNames,
  stepProgress,
  teacherLoginUrl,
  teacherMissing,
  type TeacherClassOption,
  type TeacherField,
  type TeacherFormState,
  type TeacherStep,
} from "@/lib/teacher-onboarding";

interface PublicInfo {
  ecole: string;
  classes: TeacherClassOption[];
  matieres: Array<{ id: string; nom: string }>;
  versionPolitique: string;
}

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? fallback);
  } catch {
    return fallback;
  }
}

const HELP_COUNT: Partial<Record<TeacherStep, number>> = { identity: 1, photo: 2, contact: 2, classes: 2, subjects: 1, password: 2, review: 2 };

const FIELD_ID: Record<TeacherField, string> = {
  nom: "t-nom",
  prenom: "t-prenom",
  photo: "t-photo-error",
  telephone: "t-telephone",
  email: "t-email",
  urgenceTelephone: "t-urgence-tel",
  classes: "t-classes",
  matieres: "t-subjects",
  motDePasse: "t-password",
  confirmation: "t-confirm",
  consentement: "t-consent",
};

const draftKey = (token: string) => `sa.enseignant.${token}`;

/**
 * Formulaire public d'un enseignant (lien partagé dans le groupe du personnel), pensé pour le téléphone : une question par
 * écran, de grands boutons, une barre d'actions fixe en bas, et un assistant qui explique et encourage. La saisie en cours
 * est gardée sur le téléphone (jamais le mot de passe ni la photo).
 */
export default function TeacherFormPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loadError, setLoadError] = useState<{ invalid: boolean; text: string } | null>(null);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_TEACHER_FORM);
  const [step, setStep] = useState<TeacherStep>("welcome");
  const [attempted, setAttempted] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [resumed, setResumed] = useState(false);
  // « Bon retour » : affiché jusqu'au premier changement d'écran après une reprise.
  const [resumeNotice, setResumeNotice] = useState(false);
  const [lostPhoto, setLostPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const photoUrlRef = useRef<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(attempt: number) {
      try {
        const res = await fetch(`${API_URL}/teacher-onboarding/public/${encodeURIComponent(token)}`, { headers: { "Accept-Language": getLocale() } });
        if (res.status === 404 || res.status === 410) {
          const text = await errorText(res, t("tco.pub.invalidHelp"));
          if (!cancelled) setLoadError({ invalid: true, text });
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as PublicInfo;
        if (!cancelled) setInfo(data);
      } catch {
        if (cancelled) return;
        if (attempt < 2) setTimeout(() => void load(attempt + 1), 1500);
        else setLoadError({ invalid: false, text: t("tco.pub.loadError") });
      }
    }
    void load(0);
    return () => {
      cancelled = true;
    };
    // Le jeton ne change pas pendant la vie de la page ; la langue n'a pas à relancer le chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Brouillon : relu une fois les classes et matières connues (on ne garde que des valeurs qui existent encore).
  useEffect(() => {
    if (!info || hydrated) return;
    try {
      const raw = window.localStorage.getItem(draftKey(token));
      if (raw) {
        const parsed = JSON.parse(raw) as { step?: string };
        const restored = restoreDraft(
          parsed,
          info.classes.map((c) => c.id),
          info.matieres.map((m) => m.id),
        );
        if (restored && restored.form.prenom.trim()) {
          setForm(restored.form);
          setStep(restored.step);
          setResumed(true);
          setResumeNotice(true);
          const originalIndex = ["welcome", "identity", "photo", "contact", "classes", "subjects", "password", "review"].indexOf(parsed.step ?? "welcome");
          setLostPhoto(originalIndex > 2);
        }
      }
    } catch {
      // Stockage indisponible (navigation privée...) : on repart d'un formulaire vide.
    }
    setHydrated(true);
  }, [info, hydrated, token]);

  useEffect(() => {
    if (!hydrated || done) return;
    try {
      window.localStorage.setItem(draftKey(token), JSON.stringify(draftOf(step, form)));
    } catch {
      // Pas de brouillon : le formulaire fonctionne quand même.
    }
  }, [hydrated, done, step, form, token]);

  // L'adresse locale de la photo est libérée quand elle change et à la fermeture de la page.
  useEffect(() => {
    photoUrlRef.current = photoUrl;
  }, [photoUrl]);
  useEffect(
    () => () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    },
    [],
  );

  const options = useMemo(() => info?.classes ?? [], [info]);
  const withSubjects = needsSubjects(options, form.classes);
  const missingHere = missingOnStep(step, form, !!photo, withSubjects);
  const showErrors = attempted;
  const err = (field: TeacherField) => (showErrors && missingHere.includes(field) ? t(`tco.pub.err.${field}` as MessageKey) : null);
  const set = <K extends keyof TeacherFormState>(key: K, value: TeacherFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const addOther = (name: string) => setForm((f) => ({ ...f, autresMatieres: addOtherSubject(f.autresMatieres, name) }));
  const removeOther = (name: string) => setForm((f) => ({ ...f, autresMatieres: f.autresMatieres.filter((x) => x !== name) }));
  const toggle = (key: "classes" | "matieres", id: string) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  // À chaque écran : on remonte en haut et le titre prend le focus (lecteurs d'écran, clavier).
  useEffect(() => {
    if (!hydrated) return;
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [step, hydrated]);

  const goto = useCallback((next: TeacherStep) => {
    setResumeNotice(false);
    setAttempted(false);
    setError(null);
    setStep(next);
  }, []);

  function focusFirst(fields: TeacherField[]) {
    requestAnimationFrame(() => {
      const el = fields.map((f) => document.getElementById(FIELD_ID[f])).find(Boolean);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | undefined)?.focus({ preventScroll: true });
    });
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    if (!looksLikeImage(file) || file.size > PHOTO_MAX_SOURCE_BYTES) {
      setPhotoError(t("tco.pub.photoUnreadable"));
      return;
    }
    setCropFile(file);
  }

  async function submit() {
    if (!info || !photo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/teacher-onboarding/public/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Accept-Language": getLocale() },
        body: buildTeacherFormData(form, info.versionPolitique, photo, withSubjects),
      });
      if (!res.ok) throw new Error(await errorText(res, t("common.error")));
      try {
        window.localStorage.removeItem(draftKey(token));
      } catch {
        // Rien à nettoyer.
      }
      setDone(true);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (e2) {
      const message = e2 instanceof TypeError ? t("tco.pub.loadError") : e2 instanceof Error ? e2.message : t("common.error");
      setError(t("tco.w.sendError", { message }));
    } finally {
      setBusy(false);
    }
  }

  function onNext(e: React.FormEvent) {
    e.preventDefault();
    if (step === "welcome") return goto("identity");
    const missing = missingOnStep(step, form, !!photo, withSubjects);
    if (missing.length > 0) {
      setAttempted(true);
      return focusFirst(missing);
    }
    if (step === "review") return void submit();
    if (returnToReview) {
      // Une modification peut créer un besoin nouveau (des classes de collège demandent des matières) : on va le satisfaire.
      const pending = firstStepWithMissing(form, !!photo, withSubjects);
      if (pending && pending !== "review" && pending !== step && pending !== "password") return goto(pending);
      setReturnToReview(false);
      return goto("review");
    }
    goto(neighbourStep(step, withSubjects, 1));
  }

  function onBack() {
    if (returnToReview) {
      setReturnToReview(false);
      return goto("review");
    }
    goto(neighbourStep(step, withSubjects, -1));
  }

  function edit(target: TeacherStep) {
    setReturnToReview(true);
    goto(target);
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <BrandMark className="h-14 w-14 rounded-2xl" />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink">{t(loadError.invalid ? "tco.pub.invalidTitle" : "tco.pub.title")}</h1>
        <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{loadError.text}</p>
        {loadError.invalid && <p className="mt-3 text-sm text-ink-muted">{t("tco.pub.invalidHelp")}</p>}
        <div className="mt-6">
          <CopyrightFooter />
        </div>
      </div>
    );
  }
  if (!info || !hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }

  const prenom = form.prenom.trim();

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <Confetti />
        <Assistant tone="success" messageKey="done">
          {t("tco.w.done.say", { prenom })}
        </Assistant>
        <div className="sa-pop mt-5 rounded-3xl border border-success/30 bg-success-soft px-6 py-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
            <Check size={28} />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{t("tco.pub.done.title")}</h1>
          <p className="mt-2 text-sm text-ink">{t("tco.pub.done.p1")}</p>
          <p className="mt-2 text-sm text-ink">{t("tco.pub.done.p2")}</p>
          <p className="mt-3 text-xs text-ink-muted">{t("tco.pub.done.note")}</p>
          <a href={teacherLoginUrl(typeof window === "undefined" ? "" : window.location.origin)} className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary-hover">
            {t("tco.pub.done.login")}
          </a>
        </div>
        <div className="mt-6 text-center">
          <CopyrightFooter />
        </div>
      </div>
    );
  }

  const { index, total } = stepProgress(step, withSubjects);
  const allMissing = teacherMissing(form, !!photo, withSubjects);
  const reviewMissing = step === "review" ? allMissing.filter((f) => f !== "consentement") : [];

  // Ce que dit l'assistant : il suit l'écran, réagit à la saisie et prévient quand il manque quelque chose.
  let tone: AssistantTone = "info";
  let say: string;
  if (attempted && missingHere.length > 0) {
    tone = "warn";
    say = t("tco.w.fix");
  } else if (resumeNotice && !(step === "photo" && lostPhoto)) {
    tone = "success";
    say = t("tco.w.welcome.resume");
  } else if (step === "welcome") {
    say = resumed ? t("tco.w.welcome.resume") : t("tco.w.welcome.say", { school: info.ecole });
  } else if (step === "identity") {
    say = t("tco.w.identity.say");
  } else if (step === "photo") {
    if (photo) {
      tone = "success";
      say = t("tco.w.photo.sayDone", { prenom });
    } else if (lostPhoto) {
      tone = "warn";
      say = t("tco.w.restoredNoPhoto");
    } else {
      say = t("tco.w.photo.say", { prenom });
    }
  } else if (step === "contact") {
    say = t("tco.w.contact.say");
  } else if (step === "classes") {
    if (form.classes.length > 0) {
      tone = "success";
      say = withSubjects ? t("tco.w.classes.saySecondary") : t("tco.w.classes.sayPrimary");
    } else {
      say = t("tco.w.classes.say");
    }
  } else if (step === "subjects") {
    say = t("tco.w.subjects.say");
  } else if (step === "password") {
    say = t("tco.w.password.say", { prenom });
  } else if (reviewMissing.length > 0) {
    tone = "warn";
    say = t("tco.w.review.sayMissing", { prenom });
  } else {
    say = t("tco.w.review.say", { prenom });
  }
  const helpCount = HELP_COUNT[step] ?? 0;
  const help = Array.from({ length: helpCount }, (_, i) => ({
    q: t(`tco.w.help.${step}.${i + 1}.q` as MessageKey),
    a: t(`tco.w.help.${step}.${i + 1}.a` as MessageKey),
  }));

  const titleKey: Partial<Record<TeacherStep, MessageKey>> = {
    welcome: "tco.w.welcome.title",
    identity: "tco.w.identity.title",
    photo: "tco.w.photo.title",
    contact: "tco.w.contact.title",
    classes: "tco.w.classes.title",
    subjects: "tco.w.subjects.title",
    password: "tco.w.password.title",
    review: "tco.w.review.title",
  };

  const primaryLabel =
    step === "welcome" ? t("tco.w.start") : step === "review" ? (busy ? t("tco.pub.sending") : t("tco.w.send")) : returnToReview ? t("tco.w.backToReview") : t("tco.w.next");
  const card = "rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]";

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="text-white" style={{ background: "linear-gradient(135deg,#2f2b78 0%,#211d5c 60%,#3d3196 100%)" }}>
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <BrandMark className="h-9 w-9 rounded-xl" />
          <p className="min-w-0 flex-1 truncate font-display text-base font-semibold">{info.ecole}</p>
          <LanguageSwitcher variant="dark" />
        </div>
        {step !== "welcome" && (
          <div className="mx-auto max-w-md px-4 pb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-white/85">
              <span>{t("tco.w.stepOf", { n: index, total })}</span>
              <span>{Math.round((index / total) * 100)} %</span>
            </div>
            <div role="progressbar" aria-label={t("tco.w.progress")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={index} className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(index / total) * 100}%` }} />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-40 pt-5">
        <Assistant tone={tone} help={help} messageKey={`${step}-${tone}-${say.length}`}>
          {say}
        </Assistant>

        <form id="teacher-step-form" onSubmit={onNext} noValidate className="mt-5">
          <div key={step} className="sa-step-in">
            <h1 ref={titleRef} tabIndex={-1} className="mb-4 font-display text-2xl font-semibold leading-tight text-ink outline-none">
              {t(titleKey[step] as MessageKey)}
            </h1>

            {step === "welcome" && (
              <div className={card}>
                <p className="mb-3 text-sm font-semibold text-ink">{t("tco.w.welcome.prepare")}</p>
                <ul className="space-y-3 text-[15px] text-ink">
                  {[
                    { icon: <Camera size={18} />, text: t("tco.w.welcome.p1") },
                    { icon: <Phone size={18} />, text: t("tco.w.welcome.p2") },
                    { icon: <GraduationCap size={18} />, text: t("tco.w.welcome.p3") },
                    { icon: <KeyRound size={18} />, text: t("tco.w.welcome.p4") },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden>
                        {item.icon}
                      </span>
                      {item.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-ink-muted">
                  <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" /> {t("tco.w.welcome.private")}
                </p>
              </div>
            )}

            {step === "identity" && (
              <div className="space-y-4">
                <IconInput id="t-prenom" label={t("tco.pub.prenom")} icon={<UserRound size={17} />} value={form.prenom} onChange={(v) => set("prenom", v)} error={err("prenom")} autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" />
                <IconInput id="t-nom" label={t("tco.pub.nom")} icon={<User size={17} />} value={form.nom} onChange={(v) => set("nom", v)} error={err("nom")} autoComplete="family-name" autoCapitalize="characters" enterKeyHint="next" />
              </div>
            )}

            {step === "photo" && (
              <PhotoStep
                photoUrl={photoUrl}
                error={photoError ?? err("photo")}
                onFile={pickPhoto}
              />
            )}

            {step === "contact" && (
              <div className="space-y-4">
                <IconInput
                  id="t-telephone"
                  label={t("tco.w.contact.phone")}
                  icon={<Phone size={17} />}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.telephone}
                  onChange={(v) => set("telephone", v)}
                  error={err("telephone")}
                  hint={t("tco.w.contact.phoneHint")}
                  enterKeyHint="next"
                />
                <IconInput id="t-email" label={t("tco.pub.email")} icon={<Mail size={17} />} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(v) => set("email", v)} error={err("email")} enterKeyHint="next" />
                <details className={card} open={!!(form.urgenceNom || form.urgenceTelephone) || undefined}>
                  <summary className="cursor-pointer list-none text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">{t("tco.w.contact.urgence")}</summary>
                  <p className="mb-3 mt-1 text-xs text-ink-muted">{t("tco.w.contact.urgenceHint")}</p>
                  <div className="space-y-4">
                    <IconInput id="t-urgence-nom" label={t("tco.pub.urgenceNom")} icon={<User size={17} />} value={form.urgenceNom} onChange={(v) => set("urgenceNom", v)} />
                    <IconInput id="t-urgence-tel" label={t("tco.pub.urgenceTelephone")} icon={<Phone size={17} />} type="tel" inputMode="tel" value={form.urgenceTelephone} onChange={(v) => set("urgenceTelephone", v)} error={err("urgenceTelephone")} />
                  </div>
                </details>
              </div>
            )}

            {step === "classes" && (
              <div id="t-classes" tabIndex={-1} className="outline-none">
                {options.length === 0 ? (
                  <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">{t("tco.w.classes.empty")}</p>
                ) : (
                  <ClassPicker options={options} selected={form.classes} onToggle={(id) => toggle("classes", id)} />
                )}
                {form.classes.length > 0 && <p className="mt-4 rounded-xl bg-primary-soft px-3.5 py-2.5 text-sm font-medium text-primary">{t("tco.w.classes.chosen", { names: selectedClassNames(options, form.classes).join(", ") })}</p>}
                <FieldError id="t-classes-error">{err("classes")}</FieldError>
              </div>
            )}

            {step === "subjects" && (
              <div id="t-subjects" tabIndex={-1} className="outline-none">
                <SubjectPicker subjects={info.matieres} selected={form.matieres} others={form.autresMatieres} onToggle={(id) => toggle("matieres", id)} onAddOther={addOther} onRemoveOther={removeOther} />
                {form.matieres.length + form.autresMatieres.length > 0 && <p className="mt-3 text-sm font-medium text-primary">{t("tco.w.subjects.count", { n: form.matieres.length + form.autresMatieres.length })}</p>}
                <FieldError id="t-subjects-error">{err("matieres")}</FieldError>
              </div>
            )}

            {step === "password" && (
              <div className="space-y-4">
                <PasswordField id="t-password" label={t("tco.pub.password")} value={form.motDePasse} onChange={(v) => set("motDePasse", v)} error={err("motDePasse")} showMeter />
                <PasswordField id="t-confirm" label={t("tco.pub.confirm")} value={form.confirmation} onChange={(v) => set("confirmation", v)} error={err("confirmation")} />
              </div>
            )}

            {step === "review" && (
              <div className="space-y-3">
                <section className={card}>
                  <div className="flex items-center gap-3">
                    <div className="h-[75px] w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- aperçu local de la photo choisie
                        <img src={photoUrl} alt={t("tco.w.photo.alt")} className="h-full w-full object-cover" />
                      ) : (
                        <UserRound size={28} aria-hidden className="m-auto mt-5 text-ink-muted/60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{t("tco.w.review.you")}</p>
                      <p className="truncate text-base font-semibold text-ink">
                        {form.prenom.trim()} {form.nom.trim()}
                      </p>
                      {!photo && <p className="text-sm font-medium text-danger">{t("tco.w.review.photoMissing")}</p>}
                    </div>
                    <EditButton label={t("tco.w.edit")} onClick={() => edit(photo ? "identity" : "photo")} />
                  </div>
                </section>
                <ReviewRow title={t("tco.w.review.contact")} onEdit={() => edit("contact")} edit={t("tco.w.edit")}>
                  <p className="text-[15px] text-ink">{form.telephone.trim()}</p>
                  {form.email.trim() && <p className="text-sm text-ink-muted">{form.email.trim()}</p>}
                  {(form.urgenceNom.trim() || form.urgenceTelephone.trim()) && (
                    <p className="text-sm text-ink-muted">
                      {t("tco.adm.urgence")} : {[form.urgenceNom.trim(), form.urgenceTelephone.trim()].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </ReviewRow>
                <ReviewRow title={t("tco.w.review.classes")} onEdit={() => edit("classes")} edit={t("tco.w.edit")}>
                  <Chips values={selectedClassNames(options, form.classes)} empty={t("tco.w.review.nothing")} />
                </ReviewRow>
                {withSubjects && (
                  <ReviewRow title={t("tco.w.review.subjects")} onEdit={() => edit("subjects")} edit={t("tco.w.edit")}>
                    <Chips values={[...info.matieres.filter((m) => form.matieres.includes(m.id)).map((m) => m.nom), ...form.autresMatieres]} empty={t("tco.w.review.nothing")} />
                  </ReviewRow>
                )}
                <ReviewRow title={t("tco.w.review.password")} onEdit={() => edit("password")} edit={t("tco.w.edit")}>
                  <p className="text-[15px] tracking-widest text-ink">••••••••</p>
                  <p className="text-xs text-ink-muted">{t("tco.w.review.passwordSet")}</p>
                </ReviewRow>

                <label className={`${card} flex items-start gap-3 text-[15px] text-ink`}>
                  <input id="t-consent" type="checkbox" checked={form.consentement} onChange={(e) => set("consentement", e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    {t("tco.pub.accept")} (
                    <Link href="/personnel/confidentialite" target="_blank" className="font-medium text-primary underline">
                      {t("tco.pub.readTerms")}
                    </Link>
                    )
                  </span>
                </label>
                <FieldError id="t-consent-error">{err("consentement")}</FieldError>
                {error && (
                  <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </form>
        <div className="mt-8 text-center">
          <CopyrightFooter />
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {step !== "welcome" && (
            <button type="button" onClick={onBack} disabled={busy} aria-label={t("tco.w.back")} className="sa-interactive inline-flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border-2 border-border bg-surface px-4 text-base font-semibold text-ink active:bg-surface-muted disabled:opacity-50">
              <ArrowLeft size={19} aria-hidden />
              <span className="hidden min-[380px]:inline">{t("tco.w.back")}</span>
            </button>
          )}
          <button type="submit" form="teacher-step-form" disabled={busy} className="sa-interactive inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-semibold text-white active:bg-primary-dark disabled:opacity-60">
            {busy ? <Spinner /> : step === "review" ? <Send size={19} aria-hidden /> : null}
            {primaryLabel}
            {step !== "review" && !busy && <ArrowRight size={19} aria-hidden />}
          </button>
        </div>
      </div>

      {cropFile && (
        <PhotoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onUnreadable={() => {
            setCropFile(null);
            setPhotoError(t("tco.pub.photoUnreadable"));
          }}
          onDone={(blob) => {
            if (photoUrl) URL.revokeObjectURL(photoUrl);
            setPhoto(blob);
            setPhotoUrl(URL.createObjectURL(blob));
            setLostPhoto(false);
            setPhotoError(null);
            setCropFile(null);
          }}
        />
      )}
    </div>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary active:bg-primary-soft">
      <Pencil size={14} aria-hidden /> {label}
    </button>
  );
}

function ReviewRow({ title, edit, onEdit, children }: { title: string; edit: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{title}</p>
        {children}
      </div>
      <EditButton label={edit} onClick={onEdit} />
    </section>
  );
}

function Chips({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span key={v} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
          {v}
        </span>
      ))}
    </div>
  );
}
