"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, isApiError } from "@/contexts/auth-context";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { InstallAppButton } from "@/components/install-app-button";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ExpandButton, useExpanded } from "@/components/expand";
import { useI18n } from "@/lib/i18n/use-i18n";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const help = useExpanded();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { doitChangerMotDePasse } = await login(email, motDePasse);
      // Retour à la page demandée avant la connexion, si c'est une adresse interne.
      const next = new URLSearchParams(window.location.search).get("next");
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.push(doitChangerMotDePasse ? "/changer-mot-de-passe" : target);
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      {/* Panneau de marque — masqué sur mobile pour laisser toute la place au formulaire */}
      <div className="relative hidden overflow-hidden bg-primary px-10 py-12 text-white md:flex md:w-1/2 md:flex-col md:justify-between lg:w-3/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(201,154,46,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(201,154,46,0.2), transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 font-display text-xl font-bold text-accent">
            S
          </span>
          <div>
            <p className="font-display text-lg font-semibold">Shakespeare Academy</p>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">{t("shell.tagline")}</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-3xl font-medium leading-snug lg:text-4xl">
            {t("login.heroBefore")}
            <span className="italic text-accent">{t("login.heroEmphasis")}</span>
            {t("login.heroAfter")}
          </p>
          <p className="mt-4 text-sm text-white/60">{t("login.heroBody")}</p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Shakespeare Academy</p>
      </div>

      {/* Formulaire */}
      <div className="flex flex-1 items-center justify-center bg-bg px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 md:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-accent">
                S
              </span>
              <p className="font-display text-lg font-semibold text-ink">Shakespeare Academy</p>
            </div>
            <LanguageSwitcher className="ml-auto" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("login.subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label={t("login.email")}>
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={t("login.password")}>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
              />
            </Field>
            <ErrorMessage>{error}</ErrorMessage>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("login.submitting") : t("login.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-muted">
            {t("login.parentQuestion")}{" "}
            <Link href="/parents/connexion" className="font-medium text-primary underline">
              {t("login.parentLink")}
            </Link>
          </p>
          <div className="mt-5 rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2.5">
              <ExpandButton open={help.isOpen("aide")} onClick={() => help.toggle("aide")} label={t("login.expandLabel")} />
              <span className="text-sm font-medium text-ink">{t("login.installTitle")}</span>
            </div>
            {help.isOpen("aide") && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <p className="text-xs text-ink-muted">{t("login.installHelp")}</p>
                <InstallAppButton />
              </div>
            )}
          </div>
          <div className="mt-8">
            <CopyrightFooter />
          </div>
        </div>
      </div>
    </div>
  );
}
