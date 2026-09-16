"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ancienMotDePasse, setAncien] = useState("");
  const [nouveauMotDePasse, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nouveauMotDePasse !== confirmation) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch("/auth/change-password", { ancienMotDePasse, nouveauMotDePasse });
      router.push("/");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Changement de mot de passe requis</h1>
          <p className="mt-1 text-sm text-slate-500">
            Votre mot de passe a été fixé temporairement (première connexion ou réinitialisation). Choisissez-en un
            nouveau avant de continuer.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Mot de passe actuel">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={ancienMotDePasse}
              onChange={(e) => setAncien(e.target.value)}
            />
          </Field>
          <Field label="Nouveau mot de passe (8 caractères minimum)">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={nouveauMotDePasse}
              onChange={(e) => setNouveau(e.target.value)}
            />
          </Field>
          <Field label="Confirmer le nouveau mot de passe">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Enregistrement…" : "Changer le mot de passe"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
