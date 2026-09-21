"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isApiError } from "@/contexts/auth-context";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { InstallAppButton } from "@/components/install-app-button";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { doitChangerMotDePasse } = await login(email, motDePasse);
      router.push(doitChangerMotDePasse ? "/changer-mot-de-passe" : "/");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
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
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Gestion scolaire</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-3xl font-medium leading-snug lg:text-4xl">
            Chaque inscription, chaque paiement, <span className="italic text-accent">chaque élève</span> — au bon
            endroit.
          </p>
          <p className="mt-4 text-sm text-white/60">
            Dossiers élèves, inscriptions, tarifs et solvabilité réunis dans un seul espace, pensé pour le
            secrétariat au quotidien.
          </p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Shakespeare Academy</p>
      </div>

      {/* Formulaire */}
      <div className="flex flex-1 items-center justify-center bg-bg px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-accent">
                S
              </span>
              <p className="font-display text-lg font-semibold text-ink">Shakespeare Academy</p>
            </div>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">Connexion</h1>
          <p className="mt-1 text-sm text-ink-muted">Accédez à l&apos;espace de gestion.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Identifiant (e-mail)">
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Mot de passe">
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
              {submitting ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-ink-muted">
            Sans Internet, la connexion n&apos;est possible qu&apos;avec une session déjà ouverte sur cet appareil : ouvrez
            l&apos;application installée, elle reprendra votre dernière session.
          </p>
          <InstallAppButton className="mt-4" />
        </div>
      </div>
    </div>
  );
}
