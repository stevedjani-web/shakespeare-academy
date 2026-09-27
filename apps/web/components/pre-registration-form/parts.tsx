"use client";

import { useRef, useState } from "react";
import { Check, FileText, GraduationCap, Sparkles, UploadCloud, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { fileSizeLabel, BULLETIN_ACCEPT, MAX_BULLETIN_BYTES, isBulletinType, type SectionNode } from "@/lib/pre-registrations";
import type { Swatch } from "@/lib/subject-colors";

/** Barre d'étapes : pastilles à icône reliées par une ligne qui se remplit, étapes déjà faites cliquables. */
export function StepBar({
  steps,
  current,
  reached,
  onGo,
}: {
  steps: Array<{ label: string; icon: React.ReactNode }>;
  current: number;
  /** Étape la plus avancée déjà atteinte : on peut revenir sur toutes les étapes jusque-là. */
  reached: number;
  onGo: (step: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <ol className="flex items-center gap-1.5 sm:gap-2" aria-label={t("cnt.pre.stepsLabel")}>
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const canGo = i <= reached && !active;
          return (
            <li key={s.label} className="flex flex-1 items-center gap-1.5 last:flex-none sm:gap-2">
              <button
                type="button"
                disabled={!canGo}
                onClick={() => onGo(i)}
                aria-current={active ? "step" : undefined}
                className={`group flex items-center gap-2 rounded-full pr-1 text-left transition-opacity ${canGo ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                    active
                      ? "scale-110 bg-white text-primary shadow-[0_0_0_4px_rgba(201,154,46,0.45)]"
                      : done
                        ? "bg-accent text-white"
                        : "bg-white/15 text-white/70"
                  } ${canGo ? "group-hover:scale-105" : ""}`}
                >
                  {done ? <Check size={17} strokeWidth={3} /> : s.icon}
                </span>
                <span className={`hidden text-sm font-medium sm:inline ${active ? "text-white" : done ? "text-white/90" : "text-white/55"}`}>{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-500" style={{ width: i < current ? "100%" : "0%" }} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs font-medium text-white/75 sm:hidden">
        {t("cnt.pre.stepOf", { n: current + 1, total: steps.length })} · <span className="text-white">{steps[current]?.label}</span>
      </p>
    </div>
  );
}

/** Choix de la classe : un onglet par section (si l'école en a plusieurs), puis les niveaux de chaque cycle en pastilles. */
export function LevelChips({
  tree,
  value,
  onChange,
  accent,
  invalid = false,
  label,
}: {
  tree: SectionNode[];
  value: string;
  onChange: (levelId: string) => void;
  accent: Swatch;
  invalid?: boolean;
  label: string;
}) {
  const { t } = useI18n();
  const ownerSection = tree.find((s) => s.cycles.some((c) => c.levels.some((l) => l.id === value)))?.sectionId;
  const [picked, setPicked] = useState<string | null>(null);
  const activeId = picked ?? ownerSection ?? tree[0]?.sectionId;
  const section = tree.find((s) => s.sectionId === activeId) ?? tree[0];
  if (!section) return <p className="text-xs text-ink-muted">{t("cnt.pre.noLevels")}</p>;

  return (
    <div className={`rounded-2xl border p-3 ${invalid ? "border-danger bg-danger-soft/40" : "border-border bg-surface-muted/60"}`} role="radiogroup" aria-label={label}>
      {tree.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tree.map((s) => {
            const on = s.sectionId === section.sectionId;
            return (
              <button
                key={s.sectionId}
                type="button"
                onClick={() => setPicked(s.sectionId)}
                aria-pressed={on}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-primary text-white" : "bg-surface text-ink-muted hover:text-ink"}`}
              >
                {s.sectionNom}
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-3">
        {section.cycles
          .filter((c) => c.levels.length > 0)
          .map((cycle) => (
            <div key={cycle.cycleId}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{cycle.cycleNom}</p>
              <div className="flex flex-wrap gap-2">
                {cycle.levels.map((level) => {
                  const on = level.id === value;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange(level.id)}
                      className="inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-soft)]"
                      style={
                        on
                          ? { backgroundColor: accent.border, borderColor: accent.border, color: "#ffffff" }
                          : { backgroundColor: "#ffffff", borderColor: "var(--color-border)", color: "var(--color-ink)" }
                      }
                    >
                      {on && <Check size={14} strokeWidth={3} />}
                      {level.nom}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/** Nouvel ou ancien élève : deux grandes tuiles, l'une verte, l'autre bleue, dont celle choisie se détache. */
export function KindTiles({
  name,
  value,
  onChange,
  school,
  invalid = false,
}: {
  name: string;
  value: "NOUVEAU" | "ANCIEN" | "";
  onChange: (kind: "NOUVEAU" | "ANCIEN") => void;
  school: string;
  invalid?: boolean;
}) {
  const { t } = useI18n();
  const tiles = [
    { kind: "NOUVEAU" as const, icon: <Sparkles size={20} />, title: t("cnt.pre.kindNew"), hint: t("cnt.pre.kindNewHint"), color: "var(--color-success)", soft: "var(--color-success-soft)" },
    { kind: "ANCIEN" as const, icon: <GraduationCap size={20} />, title: t("cnt.pre.kindOld", { school }), hint: t("cnt.pre.kindOldHint"), color: "var(--color-info)", soft: "var(--color-info-soft)" },
  ];
  return (
    <div role="radiogroup" aria-label={t("cnt.pre.studentStatus")} className={`grid gap-2.5 sm:grid-cols-2 ${invalid ? "rounded-2xl ring-2 ring-danger ring-offset-2" : ""}`}>
      {tiles.map((tile) => {
        const on = value === tile.kind;
        return (
          <label
            key={tile.kind}
            className="relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3.5 transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 hover:-translate-y-px hover:shadow-[var(--shadow-soft)]"
            style={{ borderColor: on ? tile.color : "var(--color-border)", backgroundColor: on ? tile.soft : "#ffffff" }}
          >
            <input type="radio" name={name} value={tile.kind} checked={on} onChange={() => onChange(tile.kind)} className="sr-only" />
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
              style={{ backgroundColor: on ? tile.color : "var(--color-surface-muted)", color: on ? "#ffffff" : tile.color }}
            >
              {tile.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug text-ink">{tile.title}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{tile.hint}</span>
            </span>
            {on && (
              <span className="sa-pop absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: tile.color }}>
                <Check size={12} strokeWidth={3.5} />
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Choix Féminin / Masculin en deux boutons accolés. */
export function SexToggle({ name, value, onChange, invalid = false }: { name: string; value: "M" | "F" | ""; onChange: (v: "M" | "F") => void; invalid?: boolean }) {
  const { t } = useI18n();
  const options = [
    { v: "F" as const, label: t("cnt.pre.female"), color: "#c2418a" },
    { v: "M" as const, label: t("cnt.pre.male"), color: "var(--color-info)" },
  ];
  return (
    <div role="radiogroup" aria-label={t("cnt.pre.sex")} className={`grid grid-cols-2 gap-1 rounded-xl border bg-surface-muted p-1 ${invalid ? "border-danger" : "border-border"}`}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <label
            key={o.v}
            className="flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
            style={on ? { backgroundColor: o.color, color: "#ffffff" } : { color: "var(--color-ink-muted)" }}
          >
            <input type="radio" name={name} value={o.v} checked={on} onChange={() => onChange(o.v)} className="sr-only" />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Zone de dépôt du bulletin : on la clique ou on y glisse le fichier ; le fichier choisi devient une pastille à retirer. */
export function FileDrop({
  file,
  error,
  onPick,
  onRemove,
  onError,
}: {
  file: File | null;
  error: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(picked: File | null | undefined) {
    if (!picked) return;
    if (!isBulletinType(picked)) return onError(t("cnt.pre.fileType"));
    if (picked.size > MAX_BULLETIN_BYTES) return onError(t("cnt.pre.fileTooBig"));
    onPick(picked);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success-soft px-3.5 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success text-white">
          <FileText size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{file.name}</span>
          <span className="block text-xs text-ink-muted">{fileSizeLabel(file.size)}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onRemove();
            if (input.current) input.current.value = "";
          }}
          aria-label={t("cnt.pre.removeFile")}
          title={t("cnt.pre.removeFile")}
          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-danger"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
          over ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary/50 hover:bg-primary-soft/50"
        }`}
      >
        <input ref={input} type="file" accept={BULLETIN_ACCEPT} className="sr-only" onChange={(e) => take(e.target.files?.[0])} />
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UploadCloud size={20} />
        </span>
        <span className="text-sm font-medium text-ink">{t("cnt.pre.dropTitle")}</span>
        <span className="text-xs text-ink-muted">{t("cnt.pre.lastReportHint")}</span>
      </label>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
