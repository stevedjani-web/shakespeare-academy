"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { ExpandButton, useExpanded } from "@/components/expand";
import { ChangePasswordForm } from "@/components/change-password-form";

export default function ChangePasswordPage() {
  const router = useRouter();
  const why = useExpanded();

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4 py-12">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-lg">🔒</span>
          <h1 className="font-display text-xl font-semibold text-ink">Changement de mot de passe requis</h1>
          <div className="mt-3 flex items-center gap-2.5">
            <ExpandButton open={why.isOpen("pourquoi")} onClick={() => why.toggle("pourquoi")} label="l'explication" />
            <span className="text-sm font-medium text-ink">Pourquoi ce changement ?</span>
          </div>
          {why.isOpen("pourquoi") && (
            <p className="mt-2 text-sm text-ink-muted">
              Votre mot de passe a été fixé temporairement (première connexion ou réinitialisation). Choisissez-en un
              nouveau avant de continuer.
            </p>
          )}
        </div>
        <ChangePasswordForm onSuccess={() => router.push("/")} />
      </Card>
    </div>
  );
}
