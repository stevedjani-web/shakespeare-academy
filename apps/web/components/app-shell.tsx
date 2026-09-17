"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  CalendarRange,
  Building2,
  Users,
  ScrollText,
  Menu,
  X,
  LogOut,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui";

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  requiredPermission?: string;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/eleves", label: "Élèves", icon: GraduationCap },
  { href: "/tarifs", label: "Tarifs & facturation", icon: Receipt, requiredPermission: "FEE_MANAGE" },
  { href: "/parametres/annees", label: "Années scolaires", icon: CalendarRange },
  { href: "/parametres/structure", label: "Structure académique", icon: Building2 },
  { href: "/parametres/utilisateurs", label: "Utilisateurs & rôles", icon: Users, requiredPermission: "USER_MANAGE" },
  { href: "/parametres/etablissement", label: "Établissement", icon: Building2 },
  { href: "/audit", label: "Journal d'audit", icon: ScrollText, requiredPermission: "AUDIT_LOG_READ" },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-accent">
        S
      </span>
      <div className="leading-tight">
        <p className="font-display text-base font-semibold text-white">Shakespeare</p>
        <p className="-mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">Academy</p>
      </div>
    </div>
  );
}

function NavItems({ links, pathname, onNavigate }: { links: NavLink[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map((link) => {
        const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`sa-interactive flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
              active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} className={active ? "text-accent" : ""} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleLinks = LINKS.filter((link) => !link.requiredPermission || hasPermission(link.requiredPermission));

  return (
    <div className="flex min-h-screen flex-1">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 bg-primary px-4 py-6 md:flex">
        <Brand />
        <NavItems links={visibleLinks} pathname={pathname} />
        <div className="rounded-xl bg-white/5 p-3">
          <p className="truncate text-sm font-medium text-white">
            {user?.prenom} {user?.nom}
          </p>
          <p className="truncate text-xs text-white/50">{user?.roleCode}</p>
          <button
            onClick={() => void logout()}
            className="sa-interactive mt-2 flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-accent"
          >
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Top bar mobile */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 md:hidden">
          <Brand />
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Ouvrir le menu"
            className="sa-interactive rounded-lg p-2 text-white hover:bg-white/10"
          >
            <Menu size={22} />
          </button>
        </header>

        {/* Drawer mobile */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-primary px-4 py-6 shadow-[var(--shadow-lift)]">
              <div className="flex items-center justify-between">
                <Brand />
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Fermer le menu"
                  className="sa-interactive rounded-lg p-1.5 text-white hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
              <NavItems links={visibleLinks} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
              <div className="rounded-xl bg-white/5 p-3">
                <p className="truncate text-sm font-medium text-white">
                  {user?.prenom} {user?.nom}
                </p>
                <p className="truncate text-xs text-white/50">{user?.roleCode}</p>
                <Button variant="secondary" className="mt-2 w-full bg-white/10 text-white border-white/10 hover:bg-white/20" onClick={() => void logout()}>
                  <LogOut size={14} /> Déconnexion
                </Button>
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
