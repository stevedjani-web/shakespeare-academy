"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, Check, KeyRound, Mail, Phone, Search, Send, ShieldCheck, Sparkles, Trash2, User, UserRound } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Button, ErrorMessage, Spinner } from "@/components/ui";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { FieldError, IconInput, PasswordField } from "@/components/family-form/fields";
import { Confetti } from "@/components/family-form/confetti";
import { PhotoCropper } from "@/components/family-form/photo-cropper";
import { useI18n } from "@/lib/i18n/use-i18n";
import { getLocale } from "@/lib/i18n/store";
import type { MessageKey } from "@/lib/i18n";
import { PHOTO_MAX_SOURCE_BYTES, looksLikeImage } from "@/lib/family-form";
import { EMPTY_TEACHER_FORM, buildTeacherFormData, teacherLoginUrl, teacherMissing, type TeacherField, type TeacherFormState } from "@/lib/teacher-onboarding";

interface PublicInfo {
  ecole: string;
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

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Formulaire public d'un enseignant (lien partagé dans le groupe du personnel) : ses informations, son mot de passe. */
export default function TeacherFormPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loadError, setLoadError] = useState<{ invalid: boolean; text: string } | null>(null);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_TEACHER_FORM);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [query, setQuery] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoUrlRef = useRef<string | null>(null);

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

  const missing = useMemo(() => teacherMissing(form), [form]);
  const set = <K extends keyof TeacherFormState>(key: K, value: TeacherFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const err = (field: TeacherField) => (attempted && missing.includes(field) ? t(`tco.pub.err.${field}` as MessageKey) : null);

  const subjects = useMemo(() => {
    const q = norm(query.trim());
    return (info?.matieres ?? []).filter((m) => !q || norm(m.nom).includes(q));
  }, [info, query]);

  function toggleSubject(id: string) {
    setForm((f) => ({ ...f, matieres: f.matieres.includes(id) ? f.matieres.filter((m) => m !== id) : [...f.matieres, id] }));
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

  function removePhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(null);
    setPhotoUrl(null);
  }

  function focusFirstInvalid(fields: TeacherField[]) {
    const ids: Record<TeacherField, string> = {
      nom: "t-nom",
      prenom: "t-prenom",
      telephone: "t-telephone",
      email: "t-email",
      urgenceTelephone: "t-urgence-tel",
      motDePasse: "t-password",
      confirmation: "t-confirm",
      consentement: "t-consent",
    };
    requestAnimationFrame(() => {
      const el = fields.map((f) => document.getElementById(ids[f])).find(Boolean);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | undefined)?.focus({ preventScroll: true });
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    setAttempted(true);
    if (missing.length > 0) {
      setError(t("tco.pub.fixRed"));
      return focusFirstInvalid(missing);
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/teacher-onboarding/public/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Accept-Language": getLocale() },
        body: buildTeacherFormData(form, info.versionPolitique, photo),
      });
      if (!res.ok) throw new Error(await errorText(res, t("common.error")));
      setDone(true);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (e2) {
      setError(e2 instanceof TypeError ? t("tco.pub.loadError") : e2 instanceof Error ? e2.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <SchoolHeader title={t(loadError.invalid ? "tco.pub.invalidTitle" : "tco.pub.title")} />
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{loadError.text}</p>
        {loadError.invalid && <p className="mt-3 text-sm text-ink-muted">{t("tco.pub.invalidHelp")}</p>}
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

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Confetti />
        <div className="rounded-3xl border border-success/30 bg-success-soft px-6 py-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
            <Check size={28} />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{t("tco.pub.done.title")}</h1>
          <p className="mt-2 text-sm text-ink">{t("tco.pub.done.p1")}</p>
          <p className="mt-2 text-sm text-ink">{t("tco.pub.done.p2")}</p>
          <p className="mt-3 text-xs text-ink-muted">{t("tco.pub.done.note")}</p>
          <a href={teacherLoginUrl(typeof window === "undefined" ? "" : window.location.origin)} className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover">
            {t("tco.pub.done.login")}
          </a>
        </div>
        <div className="mt-6 text-center">
          <CopyrightFooter />
        </div>
      </div>
    );
  }

  const section = "rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5";
  const heading = "mb-3 font-display text-lg font-semibold text-ink";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-10 sm:py-8">
      <header
        className="relative overflow-hidden rounded-3xl px-5 pb-6 pt-4 text-white shadow-[var(--shadow-lift)] sm:px-7"
        style={{ background: "linear-gradient(135deg,#2f2b78 0%,#211d5c 55%,#3d3196 100%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl" />
        <Sparkles aria-hidden size={16} className="sa-twinkle absolute right-[22%] top-[26%] hidden text-accent/80 sm:block" />
        <div className="relative">
          <div className="mb-3 flex justify-end">
            <LanguageSwitcher variant="dark" />
          </div>
          <SchoolHeader tone="dark" title={t("tco.pub.title")} subtitle={t("tco.pub.subtitle")} />
        </div>
      </header>

      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <section className={section}>
          <h2 className={heading}>{t("tco.pub.s.identity")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <IconInput id="t-nom" label={t("tco.pub.nom")} icon={<User size={16} />} value={form.nom} onChange={(v) => set("nom", v)} error={err("nom")} autoComplete="family-name" />
            <IconInput id="t-prenom" label={t("tco.pub.prenom")} icon={<UserRound size={16} />} value={form.prenom} onChange={(v) => set("prenom", v)} error={err("prenom")} autoComplete="given-name" />
          </div>
        </section>

        <section className={section}>
          <h2 className={heading}>{t("tco.pub.s.contact")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <IconInput
              id="t-telephone"
              label={t("tco.pub.telephone")}
              icon={<Phone size={16} />}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.telephone}
              onChange={(v) => set("telephone", v)}
              error={err("telephone")}
              hint={t("tco.pub.telephoneHint")}
            />
            <IconInput id="t-email" label={t("tco.pub.email")} icon={<Mail size={16} />} type="email" autoComplete="email" value={form.email} onChange={(v) => set("email", v)} error={err("email")} />
          </div>
        </section>

        <section className={section}>
          <h2 className={heading}>{t("tco.pub.s.photo")}</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-28 w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted text-ink-muted">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera size={26} aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-muted">{t("tco.pub.photoHint")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
                  <Camera size={15} /> {photoUrl ? t("tco.pub.photoChange") : t("tco.pub.photoAdd")}
                </Button>
                {photoUrl && (
                  <Button type="button" variant="ghost" onClick={removePhoto}>
                    <Trash2 size={15} /> {t("tco.pub.photoRemove")}
                  </Button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  pickPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {photoError && <FieldError id="t-photo-error">{photoError}</FieldError>}
            </div>
          </div>
        </section>

        <section className={section}>
          <h2 className={heading}>{t("tco.pub.s.subjects")}</h2>
          <p className="mb-3 text-sm text-ink-muted">{t("tco.pub.subjectsHint")}</p>
          <div className="relative mb-3">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("tco.pub.subjectsSearch")}
              aria-label={t("tco.pub.subjectsSearch")}
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 sm:text-sm"
            />
          </div>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {subjects.length === 0 && <p className="text-sm text-ink-muted">{t("tco.pub.subjectsNone")}</p>}
            {subjects.map((m) => {
              const on = form.matieres.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSubject(m.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:bg-surface-muted"}`}
                >
                  {on && <Check size={13} className="mr-1 inline" aria-hidden />}
                  {m.nom}
                </button>
              );
            })}
          </div>
          {form.matieres.length > 0 && <p className="mt-2 text-xs text-ink-muted">{t("tco.pub.subjectsCount", { n: form.matieres.length })}</p>}
        </section>

        <section className={section}>
          <h2 className={heading}>{t("tco.pub.s.emergency")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <IconInput id="t-urgence-nom" label={t("tco.pub.urgenceNom")} icon={<User size={16} />} value={form.urgenceNom} onChange={(v) => set("urgenceNom", v)} />
            <IconInput
              id="t-urgence-tel"
              label={t("tco.pub.urgenceTelephone")}
              icon={<Phone size={16} />}
              type="tel"
              inputMode="tel"
              value={form.urgenceTelephone}
              onChange={(v) => set("urgenceTelephone", v)}
              error={err("urgenceTelephone")}
            />
          </div>
        </section>

        <section className={section}>
          <h2 className={heading}>
            <KeyRound size={17} className="mr-1.5 inline text-primary" aria-hidden />
            {t("tco.pub.s.account")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField id="t-password" label={t("tco.pub.password")} value={form.motDePasse} onChange={(v) => set("motDePasse", v)} error={err("motDePasse")} showMeter />
            <PasswordField id="t-confirm" label={t("tco.pub.confirm")} value={form.confirmation} onChange={(v) => set("confirmation", v)} error={err("confirmation")} />
          </div>
          <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
            <input id="t-consent" type="checkbox" checked={form.consentement} onChange={(e) => set("consentement", e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              {t("tco.pub.accept")} (
              <Link href="/personnel/confidentialite" target="_blank" className="font-medium text-primary underline">
                {t("tco.pub.readTerms")}
              </Link>
              )
            </span>
          </label>
          <FieldError id="t-consent-error">{err("consentement")}</FieldError>
        </section>

        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner /> : <Send size={16} />} {busy ? t("tco.pub.sending") : t("tco.pub.submit")}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <ShieldCheck size={13} aria-hidden /> {t("tco.priv.s5.title")}
        </p>
        <CopyrightFooter />
      </form>

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
            setCropFile(null);
          }}
        />
      )}
    </div>
  );
}
