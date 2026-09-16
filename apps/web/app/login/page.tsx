"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isApiError } from "@/contexts/auth-context";
import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";

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
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Shakespeare Academy</h1>
          <p className="mt-1 text-sm text-slate-500">Connexion à l&apos;espace de gestion</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
      </Card>
    </div>
  );
}
