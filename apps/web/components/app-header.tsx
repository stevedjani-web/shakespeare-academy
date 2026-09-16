"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui";

interface NavLink {
  href: string;
  label: string;
  requiredPermission?: string;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Tableau de bord" },
  { href: "/eleves", label: "Élèves" },
  { href: "/parametres/annees", label: "Années scolaires" },
  { href: "/parametres/structure", label: "Structure académique" },
  { href: "/parametres/utilisateurs", label: "Utilisateurs & rôles", requiredPermission: "USER_MANAGE" },
  { href: "/parametres/etablissement", label: "Établissement" },
  { href: "/audit", label: "Journal d'audit", requiredPermission: "AUDIT_LOG_READ" },
];

export function AppHeader() {
  const { user, logout, hasPermission } = useAuth();
  const pathname = usePathname();

  const visibleLinks = LINKS.filter((link) => !link.requiredPermission || hasPermission(link.requiredPermission));

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-8">
          <span className="text-sm font-semibold text-slate-900">Shakespeare Academy</span>
          <nav className="hidden gap-1 md:flex">
            {visibleLinks.map((link) => {
              const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden text-sm text-slate-500 sm:inline">
              {user.prenom} {user.nom} · {user.roleCode}
            </span>
          )}
          <Button variant="secondary" onClick={() => void logout()}>
            Déconnexion
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
