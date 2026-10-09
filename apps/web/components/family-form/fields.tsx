"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { birthYears, daysInMonth, isoFromParts, partsFromIso, passwordStrength, type PasswordLevel } from "@/lib/family-form";

const BASE = "w-full rounded-xl border bg-surface px-3.5 py-3 text-base text-ink transition-colors placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 sm:text-sm";
const OK = "border-border focus:border-primary focus:ring-primary/15";
const KO = "border-danger bg-danger-soft/40 focus:border-danger focus:ring-danger/20";

/** Message d'erreur sous un champ : texte (jamais la couleur seule), annoncé aux lecteurs d'écran. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger">
      <AlertCircle size={14} aria-hidden /> {children}
    </p>
  );
}

/** Champ avec libellé, icône à gauche, aide et erreur. `size 16 px` sur téléphone : évite le zoom automatique d'iOS. */
export function IconInput({
  id,
  label,
  icon,
  value,
  onChange,
  error,
  hint,
  ...rest
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${error ? "text-danger" : "text-ink-muted"}`}>
          {icon}
        </span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`${BASE} pl-11 ${error ? KO : OK}`}
          {...rest}
        />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/**
 * Date de naissance en trois listes (jour, mois, année) : bien plus rapide qu'un calendrier pour remonter de dix ans, et
 * jamais une date impossible (le 31 février n'existe pas dans la liste des jours). La valeur est « AAAA-MM-JJ », ou vide
 * tant que les trois parties ne sont pas choisies.
 */
export function BirthDateField({
  id,
  label,
  value,
  onChange,
  error,
  today,
  locale,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string | null;
  today: string;
  locale: keyof typeof INTL_LOCALE;
}) {
  const { t } = useI18n();
  // Les parties partielles (jour choisi, mois pas encore) restent affichées : seule la date complète remonte.
  const [parts, setParts] = useState(() => partsFromIso(value));
  const controlled = partsFromIso(value);
  const current = value ? controlled : parts;
  const years = useMemo(() => birthYears(today), [today]);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString(INTL_LOCALE[locale], { month: "long", timeZone: "UTC" })),
    [locale],
  );
  const dayCount = current.year && current.month ? daysInMonth(Number(current.year), Number(current.month)) : 31;

  function change(next: Partial<typeof current>) {
    const merged = { ...current, ...next };
    // Un jour devenu impossible (31 puis février) est retiré plutôt que de produire une date fausse.
    if (merged.year && merged.month && merged.day && Number(merged.day) > daysInMonth(Number(merged.year), Number(merged.month))) merged.day = "";
    setParts(merged);
    const iso = isoFromParts(merged.year, merged.month, merged.day);
    if (iso > today) {
      onChange("");
      return;
    }
    onChange(iso);
  }

  const cls = `${BASE} appearance-auto px-3 ${error ? KO : OK}`;
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-ink">{label}</legend>
      <div className="grid grid-cols-[1fr_1.7fr_1.2fr] gap-2">
        <select id={`${id}-d`} aria-label={t("fam.pub.day")} value={current.day} onChange={(e) => change({ day: e.target.value })} className={cls} aria-invalid={error ? true : undefined}>
          <option value="">{t("fam.pub.day")}</option>
          {Array.from({ length: dayCount }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {i + 1}
            </option>
          ))}
        </select>
        <select id={`${id}-m`} aria-label={t("fam.pub.month")} value={current.month} onChange={(e) => change({ month: e.target.value })} className={cls} aria-invalid={error ? true : undefined}>
          <option value="">{t("fam.pub.month")}</option>
          {months.map((m, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
        <select id={`${id}-y`} aria-label={t("fam.pub.year")} value={current.year} onChange={(e) => change({ year: e.target.value })} className={cls} aria-invalid={error ? true : undefined}>
          <option value="">{t("fam.pub.year")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </fieldset>
  );
}

const LEVEL_COLOR: Record<PasswordLevel, string> = { 0: "bg-border", 1: "bg-danger", 2: "bg-warning", 3: "bg-info", 4: "bg-success" };

/** Mot de passe avec œil pour l'afficher et jauge de force : une aide, jamais une règle (8 caractères restent le seul minimum). */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  showMeter,
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  showMeter?: boolean;
  autoComplete?: string;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const level = passwordStrength(value);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${BASE} pr-12 ${error ? KO : OK}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("fam.pub.pw.hide") : t("fam.pub.pw.show")}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {showMeter && value !== "" && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${n <= level ? LEVEL_COLOR[level] : "bg-border"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            <span className="font-semibold text-ink">{level > 0 ? t(`fam.pub.pw.level${level}` as "fam.pub.pw.level1") : ""}</span>
            {level > 0 && level < 3 ? ` · ${t("fam.pub.pw.tip")}` : ""}
          </p>
        </div>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
