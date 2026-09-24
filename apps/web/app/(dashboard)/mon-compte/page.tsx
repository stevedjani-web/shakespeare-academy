"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, PageTitle, SuccessMessage } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";

export default function MonComptePage() {
  const { user } = useAuth();
  const [done, setDone] = useState(false);

  return (
    <div>
      <PageTitle eyebrow="Mon compte" subtitle="Vos informations de connexion et votre mot de passe.">
        Mon compte
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Identité</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-ink-muted">Nom</dt>
              <dd className="font-medium text-ink">
                {user?.prenom} {user?.nom}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Identifiant de connexion</dt>
              <dd className="break-all font-medium text-ink">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Rôle</dt>
              <dd className="font-medium text-ink">{user?.roleCode}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Changer mon mot de passe</h2>
          <p className="mb-4 mt-1 text-sm text-ink-muted">
            Saisissez votre mot de passe actuel puis choisissez-en un nouveau. En cas d&apos;oubli, adressez-vous à
            l&apos;administrateur : il peut vous en fixer un temporaire.
          </p>
          {done && (
            <div className="mb-4">
              <SuccessMessage>Mot de passe modifié. Utilisez-le à votre prochaine connexion.</SuccessMessage>
            </div>
          )}
          <ChangePasswordForm onSuccess={() => setDone(true)} />
        </Card>
      </div>
    </div>
  );
}
