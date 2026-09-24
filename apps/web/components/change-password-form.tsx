"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";

// Formulaire partagé par le changement forcé (après une réinitialisation) et le changement volontaire (Mon compte).
export function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
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
    if (nouveauMotDePasse === ancienMotDePasse) {
      setError("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch("/auth/change-password", { ancienMotDePasse, nouveauMotDePasse });
      setAncien("");
      setNouveau("");
      setConfirmation("");
      onSuccess();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
  );
}
