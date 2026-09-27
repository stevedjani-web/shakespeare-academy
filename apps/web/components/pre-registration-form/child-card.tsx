"use client";

import { AlertCircle, Check, ChevronDown, Trash2 } from "lucide-react";
import { Field, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/use-i18n";
import { childInitials, childMissing, childSwatch, type ChildField, type ChildForm } from "@/lib/pre-registration-form";
import type { SectionNode } from "@/lib/pre-registrations";
import { FileDrop, KindTiles, LevelChips, SexToggle } from "./parts";

/** Nom d'une classe d'après son identifiant, dans l'arbre des niveaux de l'école. */
export function levelNameOf(tree: SectionNode[], id: string): string {
  for (const s of tree) for (const c of s.cycles) for (const l of c.levels) if (l.id === id) return l.nom;
  return "";
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
      <AlertCircle size={12} /> {children}
    </p>
  );
}

/**
 * Une fiche enfant repliable. Fermée, elle se résume en une ligne colorée (nom, classe demandée, statut) ; ouverte, elle
 * porte tous les champs de cet enfant. Chaque enfant garde sa couleur, de la fiche au récapitulatif.
 */
export function ChildCard({
  index,
  child,
  tree,
  school,
  today,
  open,
  errors,
  canRemove,
  onToggle,
  onChange,
  onRemove,
}: {
  index: number;
  child: ChildForm;
  tree: SectionNode[];
  school: string;
  today: string;
  open: boolean;
  /** Champs à signaler en rouge (après un essai de « Continuer »), ou null tant que le parent n'a rien tenté. */
  errors: Set<ChildField> | null;
  canRemove: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ChildForm>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const sw = childSwatch(index);
  const complete = childMissing(child, today).length === 0;
  const bad = (f: ChildField) => !!errors?.has(f);
  const name = `${child.prenom} ${child.nom}`.trim();
  const summary = [
    child.levelId ? levelNameOf(tree, child.levelId) : null,
    child.typeEleve === "NOUVEAU" ? t("cnt.pre.kindNew") : child.typeEleve === "ANCIEN" ? t("cnt.pre.kindOld", { school }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className="sa-step-in overflow-hidden rounded-3xl border-2 bg-surface shadow-[var(--shadow-soft)] transition-shadow"
      style={{ borderColor: open ? sw.border : `${sw.border}66` }}
      data-child={child.key}
    >
      <div className="flex items-center" style={{ backgroundColor: sw.bg }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={t("cnt.pre.childN", { n: index + 1 })}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm" style={{ backgroundColor: sw.border }}>
            {childInitials(child, index)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-semibold" style={{ color: sw.text }}>
              {name || t("cnt.pre.childN", { n: index + 1 })}
            </span>
            <span className="block truncate text-xs" style={{ color: sw.text, opacity: 0.8 }}>
              {summary || t("cnt.pre.recapPending")}
            </span>
          </span>
          {complete ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-white" title={t("cnt.pre.complete")}>
              <Check size={14} strokeWidth={3} />
            </span>
          ) : (
            <span className="hidden shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold sm:inline" style={{ color: sw.text }}>
              {t("cnt.pre.recapPending")}
            </span>
          )}
          <ChevronDown size={18} className={`shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} style={{ color: sw.text }} />
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("cnt.pre.removeChildAria", { n: index + 1 })}
            title={t("cnt.pre.removeChild")}
            className="mr-2 shrink-0 rounded-full p-2 transition-colors hover:bg-white/70 hover:text-danger"
            style={{ color: sw.text }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field label={t("cnt.pre.firstName")}>
                <Input value={child.prenom} autoComplete="off" aria-invalid={bad("prenom")} className={bad("prenom") ? "border-danger!" : ""} onChange={(e) => onChange({ prenom: e.target.value })} />
              </Field>
              {bad("prenom") && <Hint>{t("cnt.pre.required")}</Hint>}
            </div>
            <div>
              <Field label={t("cnt.pre.lastName")}>
                <Input value={child.nom} autoComplete="off" aria-invalid={bad("nom")} className={bad("nom") ? "border-danger!" : ""} onChange={(e) => onChange({ nom: e.target.value })} />
              </Field>
              {bad("nom") && <Hint>{t("cnt.pre.required")}</Hint>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Field label={t("cnt.pre.sex")}>
                <SexToggle name={`${child.key}-sexe`} value={child.sexe} invalid={bad("sexe")} onChange={(sexe) => onChange({ sexe })} />
              </Field>
              {bad("sexe") && <Hint>{t("cnt.pre.required")}</Hint>}
            </div>
            <div>
              <Field label={t("cnt.pre.birthDate")}>
                <Input type="date" max={today} value={child.dateNaissance} aria-invalid={bad("dateNaissance")} className={bad("dateNaissance") ? "border-danger!" : ""} onChange={(e) => onChange({ dateNaissance: e.target.value })} />
              </Field>
              {bad("dateNaissance") && <Hint>{t("cnt.pre.required")}</Hint>}
            </div>
          </div>

          <Field label={t("cnt.pre.birthPlace")}>
            <Input value={child.lieuNaissance} autoComplete="off" onChange={(e) => onChange({ lieuNaissance: e.target.value })} />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">{t("cnt.pre.level")}</p>
            <LevelChips tree={tree} value={child.levelId} accent={sw} invalid={bad("levelId")} label={t("cnt.pre.level")} onChange={(levelId) => onChange({ levelId })} />
            {bad("levelId") && <Hint>{t("cnt.pre.chooseClassHint")}</Hint>}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">{t("cnt.pre.studentStatus")}</p>
            <KindTiles name={`${child.key}-statut`} value={child.typeEleve} school={school} invalid={bad("typeEleve")} onChange={(typeEleve) => onChange({ typeEleve })} />
            {bad("typeEleve") && <Hint>{t("cnt.pre.needChoice")}</Hint>}
          </div>

          {child.typeEleve === "ANCIEN" && (
            <div className="sa-step-in space-y-2 rounded-2xl border border-info/25 bg-info-soft/60 p-3.5">
              <p className="text-sm font-medium text-ink">{t("cnt.pre.previousClass")}</p>
              <LevelChips tree={tree} value={child.classePrecedenteLevelId} accent={{ ...sw, border: "#2563a8" }} invalid={bad("classePrecedenteLevelId")} label={t("cnt.pre.previousClass")} onChange={(classePrecedenteLevelId) => onChange({ classePrecedenteLevelId })} />
              {bad("classePrecedenteLevelId") ? <Hint>{t("cnt.pre.chooseClassHint")}</Hint> : <p className="text-xs text-ink-muted">{t("cnt.pre.previousClassHint")}</p>}
            </div>
          )}

          {child.typeEleve === "NOUVEAU" && (
            <div className="sa-step-in space-y-4 rounded-2xl border border-success/25 bg-success-soft/50 p-3.5">
              <Field label={t("cnt.pre.previousSchool")}>
                <Input maxLength={120} value={child.ancienEtablissement} autoComplete="off" onChange={(e) => onChange({ ancienEtablissement: e.target.value })} />
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">{t("cnt.pre.lastReport")}</p>
                <FileDrop
                  file={child.bulletin}
                  error={child.bulletinError}
                  onPick={(bulletin) => onChange({ bulletin, bulletinError: null })}
                  onRemove={() => onChange({ bulletin: null, bulletinError: null })}
                  onError={(bulletinError) => onChange({ bulletin: null, bulletinError })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
