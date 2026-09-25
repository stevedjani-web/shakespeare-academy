"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import type { SectionNode } from "@/lib/pre-registrations";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { useI18n } from "@/lib/i18n/use-i18n";
import { translate } from "@/lib/i18n";

interface Form {
  nom: string;
  prenom: string;
  sexe: "M" | "F";
  dateNaissance: string;
  lieuNaissance: string;
  nationalite: string;
  levelId: string;
  responsableNom: string;
  responsablePrenom: string;
  responsableTelephone: string;
  responsableEmail: string;
  message: string;
}

const EMPTY: Form = {
  nom: "",
  prenom: "",
  sexe: "F",
  dateNaissance: "",
  lieuNaissance: "",
  nationalite: "",
  levelId: "",
  responsableNom: "",
  responsablePrenom: "",
  responsableTelephone: "",
  responsableEmail: "",
  message: "",
};

async function extractError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? translate("common.error"));
  } catch {
    return translate("common.error");
  }
}

/**
 * Dépôt public d'une demande de préinscription : aucun compte requis. Le niveau réel de la classe et l'année scolaire
 * sont choisis par le secrétariat à l'examen de la demande, jamais ici. Aucun frais n'est demandé à ce stade.
 */
export default function PreRegistrationPage() {
  const { t } = useI18n();
  const [tree, setTree] = useState<SectionNode[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/preinscriptions/niveaux`)
      .then((res) => (res.ok ? (res.json() as Promise<SectionNode[]>) : Promise.reject()))
      .then(setTree)
      .catch(() => setTree([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/preinscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: form.nom,
          prenom: form.prenom,
          sexe: form.sexe,
          dateNaissance: form.dateNaissance,
          lieuNaissance: form.lieuNaissance.trim() || undefined,
          nationalite: form.nationalite.trim() || undefined,
          levelId: form.levelId,
          responsableNom: form.responsableNom,
          responsablePrenom: form.responsablePrenom,
          responsableTelephone: form.responsableTelephone,
          responsableEmail: form.responsableEmail.trim() || undefined,
          message: form.message.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      const body = (await res.json()) as { reference: string };
      setReference(body.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher />
        </div>
        <SchoolHeader />
        <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-soft)]">
          <p className="font-display text-lg font-semibold text-ink">{t("cnt.pre.sentTitle")}</p>
          <p className="mt-2 text-sm text-ink-muted">{t("cnt.pre.sentNote")}</p>
          <p className="mt-3 rounded-xl bg-primary-soft px-4 py-3 font-mono text-xl font-semibold tracking-wide text-primary">{reference}</p>
          <p className="mt-3 text-sm text-ink-muted">{t("cnt.pre.sentInfo")}</p>
          <Link href="/preinscription/suivi" className="mt-4 inline-block font-medium text-primary underline">
            {t("cnt.pre.track")}
          </Link>
        </div>
        <div className="mt-4">
          <CopyrightFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-3 flex justify-end">
        <LanguageSwitcher />
      </div>
      <SchoolHeader />
      <PageTitle subtitle={t("cnt.pre.subtitle")}>{t("cnt.pre.title")}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="font-display text-sm font-semibold text-ink">{t("cnt.pre.child")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("cnt.pre.lastName")}>
              <Input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </Field>
            <Field label={t("cnt.pre.firstName")}>
              <Input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("cnt.pre.sex")}>
              <Select value={form.sexe} onChange={(e) => setForm({ ...form, sexe: e.target.value as "M" | "F" })}>
                <option value="F">{t("cnt.pre.female")}</option>
                <option value="M">{t("cnt.pre.male")}</option>
              </Select>
            </Field>
            <Field label={t("cnt.pre.birthDate")}>
              <Input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.dateNaissance} onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })} />
            </Field>
          </div>
          <Field label={t("cnt.pre.birthPlace")}>
            <Input value={form.lieuNaissance} onChange={(e) => setForm({ ...form, lieuNaissance: e.target.value })} />
          </Field>
          <Field label={t("cnt.pre.level")}>
            <Select required value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
              <option value="">{t("cnt.pre.choose")}</option>
              {tree.map((section) => (
                <optgroup key={section.sectionId} label={section.sectionNom}>
                  {section.cycles.flatMap((cycle) =>
                    cycle.levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {cycle.cycleNom} · {level.nom}
                      </option>
                    )),
                  )}
                </optgroup>
              ))}
            </Select>
          </Field>
          {tree.length === 0 && <p className="text-xs text-ink-muted">{t("cnt.pre.noLevels")}</p>}

          <h2 className="pt-2 font-display text-sm font-semibold text-ink">{t("cnt.pre.guardian")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("cnt.pre.lastName")}>
              <Input required value={form.responsableNom} onChange={(e) => setForm({ ...form, responsableNom: e.target.value })} />
            </Field>
            <Field label={t("cnt.pre.firstName")}>
              <Input required value={form.responsablePrenom} onChange={(e) => setForm({ ...form, responsablePrenom: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("cnt.pre.phone")}>
              <Input type="tel" required value={form.responsableTelephone} onChange={(e) => setForm({ ...form, responsableTelephone: e.target.value })} />
            </Field>
            <Field label={t("cnt.pre.email")}>
              <Input type="email" value={form.responsableEmail} onChange={(e) => setForm({ ...form, responsableEmail: e.target.value })} />
            </Field>
          </div>
          <Field label={t("cnt.pre.message")}>
            <textarea
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
              maxLength={500}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("cnt.pre.sending") : t("cnt.pre.submit")}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t("cnt.pre.already")}{" "}
        <Link href="/preinscription/suivi" className="font-medium text-primary underline">
          {t("cnt.pre.followStatus")}
        </Link>
      </p>
      <div className="mt-6">
        <CopyrightFooter />
      </div>
    </div>
  );
}
