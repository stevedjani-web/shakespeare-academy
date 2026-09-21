"use client";

import { useState } from "react";
import { KeyRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, ErrorMessage, Field, Input, StatCard } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { ActivationLetters } from "@/components/parents/activation-letters";
import type { BulkCodesResult, OnboardingSummary } from "@/lib/parent-activation";
import type { School } from "@/lib/types";

interface Target {
  classId: string | null;
  label: string;
  sansCode: number;
  codesEnAttente: number;
}

/**
 * Mise en service des parents : où en sont les familles, et génération des codes d'une classe en une fois (lettres à
 * imprimer et messages WhatsApp). Un second clic ne régénère rien : les lettres déjà imprimées restent valables.
 */
export function OnboardingPanel({ summary, school, onChanged }: { summary: OnboardingSummary; school: School; onChanged: () => void }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [regenerer, setRegenerer] = useState(false);
  const [jours, setJours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCodesResult | null>(null);

  const pct = summary.total > 0 ? Math.round((summary.actifs / summary.total) * 100) : 0;
  const validite = jours === "" ? school.parentCodeValiditeJours : Number(jours);

  function open(t: Target) {
    setTarget(t);
    setRegenerer(false);
    setJours("");
    setError(null);
  }

  async function generate() {
    if (!target) return;
    if (!Number.isInteger(validite) || validite < 1 || validite > 90) {
      setError("La durée doit être un nombre entier de jours entre 1 et 90.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<BulkCodesResult>("/parent-accounts/bulk-codes", {
        ...(target.classId ? { classId: target.classId } : {}),
        ...(regenerer ? { regenerer: true } : {}),
        validiteJours: validite,
      });
      setResult(res);
      setTarget(null);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const concerned = target ? target.sansCode + (regenerer ? target.codesEnAttente : 0) : 0;

  return (
    <div className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Familles concernées" value={summary.total} tone="primary" icon={<Users size={18} />} hint="Au moins un enfant inscrit avec accès au portail" />
        <StatCard label="Comptes activés" value={`${summary.actifs} (${pct} %)`} tone="success" progress={pct} />
        <StatCard label="Codes en attente" value={summary.codesEnAttente} tone="warning" hint="Lettre remise, pas encore activée" />
        <StatCard label="Sans code" value={summary.sansCode} tone="danger" hint="Aucun code généré" />
      </div>
      {(summary.desactives > 0 || summary.sansAcces > 0) && (
        <p className="mt-2 text-xs text-ink-muted">
          {summary.desactives > 0 && `${summary.desactives} compte(s) désactivé(s). `}
          {summary.sansAcces > 0 && `${summary.sansAcces} responsable(s) sans accès au portail pour tous leurs enfants (non comptés).`}
        </p>
      )}

      <Card className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Avancement par classe</h2>
          <Button variant="secondary" onClick={() => open({ classId: null, label: "toute l'école", sansCode: summary.sansCode, codesEnAttente: summary.codesEnAttente })} disabled={summary.sansCode === 0 && summary.codesEnAttente === 0}>
            <KeyRound size={16} /> Toute l&apos;école
          </Button>
        </div>
        {summary.classes.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune famille concernée : il faut des élèves inscrits dans l&apos;année active, avec un responsable.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Classe</th>
                  <th className="py-2 pr-4 font-medium">Familles</th>
                  <th className="py-2 pr-4 font-medium">Activées</th>
                  <th className="py-2 pr-4 font-medium">Code en attente</th>
                  <th className="py-2 pr-4 font-medium">Sans code</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {summary.classes.map((c) => (
                  <tr key={c.classId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink">{c.classe}</td>
                    <td className="py-2 pr-4">{c.total}</td>
                    <td className="py-2 pr-4 text-success">{c.actifs}</td>
                    <td className="py-2 pr-4 text-warning">{c.codesEnAttente}</td>
                    <td className="py-2 pr-4 text-danger">{c.sansCode}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="secondary"
                        disabled={c.sansCode === 0 && c.codesEnAttente === 0}
                        onClick={() => open({ classId: c.classId, label: c.classe, sansCode: c.sansCode, codesEnAttente: c.codesEnAttente })}
                      >
                        Générer les codes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {target && (
        <Card className="mt-4 border-primary/40">
          <h3 className="font-display text-base font-semibold text-ink">Générer les codes : {target.label}</h3>
          <p className="mt-2 text-sm text-ink">
            {target.sansCode} famille(s) sans code recevront chacune une lettre (une seule lettre par famille, même avec plusieurs enfants). Les familles qui ont
            déjà un compte ou un code en cours ne sont pas touchées : les lettres déjà imprimées restent valables.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Field label="Validité (jours)">
                <Input inputMode="numeric" value={jours === "" ? String(school.parentCodeValiditeJours) : jours} onChange={(e) => setJours(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
          </div>
          {target.codesEnAttente > 0 && (
            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" checked={regenerer} onChange={(e) => setRegenerer(e.target.checked)} />
              <span>
                Inclure aussi les {target.codesEnAttente} famille(s) qui ont déjà un code en attente.
                {regenerer && <span className="mt-1 block text-warning">Attention : leur ancien code sera annulé, leur lettre déjà remise ne marchera plus.</span>}
              </span>
            </label>
          )}
          <ErrorMessage>{error}</ErrorMessage>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void generate()} disabled={busy || concerned === 0}>
              <KeyRound size={16} /> {busy ? "Génération…" : `Générer pour ${concerned} famille(s)`}
            </Button>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
              Annuler
            </Button>
          </div>
        </Card>
      )}

      {result && <ActivationLetters result={result} school={school} onClose={() => setResult(null)} />}
    </div>
  );
}
