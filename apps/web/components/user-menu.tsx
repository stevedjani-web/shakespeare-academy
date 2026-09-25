"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Lock, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useOutbox } from "@/lib/outbox";

/**
 * Bloc du compte en haut de page (usage courant des applications : la langue toujours visible, et sous l'avatar le
 * menu du compte avec le nom, le rôle, « Mon compte » et la déconnexion). Se ferme au clic à l'extérieur, avec Échap
 * et à chaque changement de page.
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const { pending, failed } = useOutbox();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleLogout() {
    const waiting = pending + failed;
    if (waiting > 0 && !window.confirm(t("shell.logoutConfirm", { count: waiting }))) return;
    setOpen(false);
    void logout();
  }

  // Le choix de langue s'applique tout de suite ; il est aussi enregistré sur le compte pour suivre l'utilisateur.
  const saveLanguage = (langue: string) => api.patch("/auth/language", { langue });

  const fullName = `${user?.prenom ?? ""} ${user?.nom ?? ""}`.trim();
  const initials = `${user?.prenom?.[0] ?? ""}${user?.nom?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <LanguageSwitcher onChoose={saveLanguage} />
      <div ref={wrapper} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("shell.userMenu")}
          className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-2 hover:bg-primary-soft sm:pr-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{initials}</span>
          <span className="hidden min-w-0 text-left leading-tight sm:block">
            <span className="block max-w-[10rem] truncate text-sm font-medium text-ink">{fullName}</span>
            <span className="block max-w-[10rem] truncate text-[11px] text-ink-muted">{user?.roleCode}</span>
          </span>
          <ChevronDown size={14} className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lift)]"
          >
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{fullName}</p>
              {user?.email && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
              <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">{user?.roleCode}</p>
            </div>
            <Link
              href="/mon-compte"
              role="menuitem"
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-primary-soft"
            >
              <Lock size={16} className="text-ink-muted" /> {t("shell.myAccount")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-left text-sm text-danger hover:bg-primary-soft"
            >
              <LogOut size={16} /> {t("shell.logout")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
