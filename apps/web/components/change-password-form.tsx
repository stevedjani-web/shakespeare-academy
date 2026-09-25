"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";

// Formulaire partagé par le changement forcé (après une réinitialisation) et le changement volontaire (Mon compte).
export function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const [ancienMotDePasse, setAncien] = useState("");
  const [nouveauMotDePasse, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nouveauMotDePasse !== confirmation) {
      setError(t("pwd.mismatch"));
      return;
    }
    if (nouveauMotDePasse === ancienMotDePasse) {
      setError(t("pwd.same"));
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
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label={t("pwd.current")}>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={ancienMotDePasse}
          onChange={(e) => setAncien(e.target.value)}
        />
      </Field>
      <Field label={t("pwd.new")}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={nouveauMotDePasse}
          onChange={(e) => setNouveau(e.target.value)}
        />
      </Field>
      <Field label={t("pwd.confirm")}>
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
        {submitting ? t("pwd.saving") : t("pwd.submit")}
      </Button>
    </form>
  );
}
