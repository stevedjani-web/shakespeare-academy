"use client";

import { useState } from "react";
import { KeyRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, ErrorMessage, Field, Input, StatCard } from "@/components/ui";
import { describeError } from "@/components/vie-scolaire/shared";
import { ActivationLetters } from "@/components/parents/activation-letters";
import type { BulkCodesResult, OnboardingSummary } from "@/lib/parent-activation";
import type { School } from "@/lib/types";
import { useI18n } from "@/lib/i18n/use-i18n";

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
  const { t } = useI18n();
  const [target, setTarget] = useState<Target | null>(null);
  const [regenerer, setRegenerer] = useState(false);
  const [jours, setJours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCodesResult | null>(null);

  const pct = summary.total > 0 ? Math.round((summary.actifs / summary.total) * 100) : 0;
  const validite = jours === "" ? school.parentCodeValiditeJours : Number(jours);

  function open(next: Target) {
    setTarget(next);
    setRegenerer(false);
    setJours("");
    setError(null);
  }

  async function generate() {
    if (!target) return;
    if (!Number.isInteger(validite) || validite < 1 || validite > 90) {
      setError(t("adm.onb.durationInvalid"));
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
        <StatCard label={t("adm.onb.families")} value={summary.total} tone="primary" icon={<Users size={18} />} hint={t("adm.onb.familiesHint")} />
        <StatCard label={t("adm.onb.activated")} value={`${summary.actifs} (${pct} %)`} tone="success" progress={pct} />
        <StatCard label={t("adm.onb.pending")} value={summary.codesEnAttente} tone="warning" hint={t("adm.onb.pendingHint")} />
        <StatCard label={t("adm.onb.noCode")} value={summary.sansCode} tone="danger" hint={t("adm.onb.noCodeHint")} />
      </div>
      {(summary.desactives > 0 || summary.sansAcces > 0) && (
        <p className="mt-2 text-xs text-ink-muted">
          {summary.desactives > 0 && t("adm.onb.disabledCount", { n: summary.desactives })}
          {summary.sansAcces > 0 && t("adm.onb.noAccessCount", { n: summary.sansAcces })}
        </p>
      )}

      <Card className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">{t("adm.onb.progress")}</h2>
          <Button variant="secondary" onClick={() => open({ classId: null, label: t("adm.onb.wholeSchoolLabel"), sansCode: summary.sansCode, codesEnAttente: summary.codesEnAttente })} disabled={summary.sansCode === 0 && summary.codesEnAttente === 0}>
            <KeyRound size={16} /> {t("adm.onb.wholeSchool")}
          </Button>
        </div>
        {summary.classes.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("adm.onb.noFamily")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-ink-muted">
                  <th className="py-2 pr-4 font-medium">{t("adm.onb.colClass")}</th>
                  <th className="py-2 pr-4 font-medium">{t("adm.onb.colFamilies")}</th>
                  <th className="py-2 pr-4 font-medium">{t("adm.onb.colActivated")}</th>
                  <th className="py-2 pr-4 font-medium">{t("adm.onb.colPending")}</th>
                  <th className="py-2 pr-4 font-medium">{t("adm.onb.colNoCode")}</th>
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
                        {t("adm.onb.generateCodes")}
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
          <h3 className="font-display text-base font-semibold text-ink">{t("adm.onb.generateFor", { label: target.label })}</h3>
          <p className="mt-2 text-sm text-ink">
            {t("adm.onb.generateHelp", { n: target.sansCode })}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Field label={t("adm.onb.validity")}>
                <Input inputMode="numeric" value={jours === "" ? String(school.parentCodeValiditeJours) : jours} onChange={(e) => setJours(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
          </div>
          {target.codesEnAttente > 0 && (
            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" checked={regenerer} onChange={(e) => setRegenerer(e.target.checked)} />
              <span>
                {t("adm.onb.includePending", { n: target.codesEnAttente })}
                {regenerer && <span className="mt-1 block text-warning">{t("adm.onb.regenWarning")}</span>}
              </span>
            </label>
          )}
          <ErrorMessage>{error}</ErrorMessage>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void generate()} disabled={busy || concerned === 0}>
              <KeyRound size={16} /> {busy ? t("adm.onb.generating") : t("adm.onb.generateN", { n: concerned })}
            </Button>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
              {t("adm.onb.cancel")}
            </Button>
          </div>
        </Card>
      )}

      {result && <ActivationLetters result={result} school={school} onClose={() => setResult(null)} />}
    </div>
  );
}
