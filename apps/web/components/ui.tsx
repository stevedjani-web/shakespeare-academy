import { translate } from "@/lib/i18n";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { HelpTip } from "@/components/help-tip";

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      // `sa-interactive` (retour visuel à l'appui : la carte rétrécit à 97 %) seulement pour une carte cliquable dans son
      // ensemble. Sur une carte ordinaire, il déplacerait tout son contenu pendant l'appui : avec un long tableau
      // (170 élèves, 12 000 px de haut) le bouton visé s'éloigne de 180 px et le clic n'atteint plus rien.
      className={`rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-[var(--shadow-soft)] ${
        interactive ? "sa-interactive sa-card-hover cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  subtitle,
  eyebrow,
  helpId,
}: {
  children: ReactNode;
  subtitle?: string;
  eyebrow?: string;
  /** Identifiant de `lib/help-content.ts` : affiche la puce d'aide contextuelle à côté du titre. */
  helpId?: string;
}) {
  return (
    <div className="mb-6 sm:mb-8">
      {eyebrow && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-dark">{eyebrow}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink">{children}</h1>
        {helpId && <HelpTip id={helpId} />}
      </div>
      {subtitle && <p className="mt-1.5 text-sm text-ink-muted max-w-2xl">{subtitle}</p>}
    </div>
  );
}

type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-[var(--shadow-soft)] hover:bg-primary-dark disabled:bg-primary/40 disabled:shadow-none",
  accent:
    "bg-accent text-white shadow-[var(--shadow-soft)] hover:bg-accent-dark disabled:bg-accent/40 disabled:shadow-none",
  secondary:
    "bg-surface text-ink border border-border hover:border-primary/40 hover:bg-primary-soft disabled:text-ink-muted disabled:hover:bg-surface",
  danger:
    "bg-danger text-white shadow-[var(--shadow-soft)] hover:bg-danger/90 disabled:bg-danger/40 disabled:shadow-none",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink disabled:text-ink-muted/50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`sa-interactive inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`mb-1.5 block text-sm font-medium text-ink ${className}`} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      <span aria-hidden>⚠</span>
      <span>{children}</span>
    </p>
  );
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
      <span aria-hidden>✓</span>
      <span>{children}</span>
    </p>
  );
}

const badgeColors: Record<string, string> = {
  slate: "bg-surface-muted text-ink-muted",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent-dark",
  green: "bg-success-soft text-success",
  blue: "bg-info-soft text-info",
  orange: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  gray: "bg-surface-muted text-ink-muted",
};

export function Badge({ children, color = "slate" }: { children: ReactNode; color?: keyof typeof badgeColors }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeColors[color]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-label={translate("common.loading")}
    />
  );
}

export type StatTone = "primary" | "accent" | "success" | "danger" | "warning" | "info";

// Couleur = sens : vert pour ce qui est positif (encaissé, solde), rouge pour ce qui est négatif
// (impayé, retard), orange pour ce qui demande de l'attention, bleu pour l'information neutre.
// Classes écrites en toutes lettres (Tailwind ne détecte pas des noms construits dynamiquement).
const STAT_TONES: Record<StatTone, { card: string; icon: string; value: string; bar: string }> = {
  primary: { card: "border-l-primary bg-primary-soft/50", icon: "bg-primary text-white", value: "text-primary", bar: "bg-primary" },
  accent: { card: "border-l-accent bg-accent-soft/60", icon: "bg-accent text-white", value: "text-accent-dark", bar: "bg-accent" },
  success: { card: "border-l-success bg-success-soft/70", icon: "bg-success text-white", value: "text-success", bar: "bg-success" },
  danger: { card: "border-l-danger bg-danger-soft/70", icon: "bg-danger text-white", value: "text-danger", bar: "bg-danger" },
  warning: { card: "border-l-warning bg-warning-soft/70", icon: "bg-warning text-white", value: "text-warning", bar: "bg-warning" },
  info: { card: "border-l-info bg-info-soft/70", icon: "bg-info text-white", value: "text-info", bar: "bg-info" },
};

export function StatCard({
  label,
  value,
  hint,
  tone = "primary",
  icon,
  progress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  /** 0 à 100 : affiche une jauge sous la valeur. */
  progress?: number | null;
}) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={`sa-interactive h-full rounded-2xl border border-l-4 border-border p-4 shadow-[var(--shadow-soft)] sm:p-5 ${t.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{label}</p>
          <p className={`mt-1 font-display text-2xl font-semibold sm:text-3xl ${t.value}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg shadow-sm ${t.icon}`}>
            {icon}
          </div>
        )}
      </div>
      {typeof progress === "number" && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-6 flex items-center gap-1 sm:gap-2">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <div key={label} className="flex flex-1 items-center gap-1 sm:gap-2 last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold sa-interactive ${
                  state === "done"
                    ? "bg-accent text-white"
                    : state === "active"
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-ink-muted"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={`hidden text-xs font-medium sm:inline ${state === "todo" ? "text-ink-muted" : "text-ink"}`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`h-px flex-1 ${i < current ? "bg-accent" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
