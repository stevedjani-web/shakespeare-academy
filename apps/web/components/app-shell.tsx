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
  Receipt,
  Wallet,
  Smartphone,
  ClipboardList,
  AlertOctagon,
  School,
  RefreshCw,
  CalendarClock,
  BookOpenCheck,
  BookOpenText,
  ClipboardCheck,
  KeyRound,
  ScanLine,
  UserCheck,
  MessagesSquare,
  Megaphone,
  Gauge,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { Link2, LifeBuoy, HelpCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { MessageKey } from "@/lib/i18n";
import { UserMenu } from "@/components/user-menu";
import { InstallAppButton } from "@/components/install-app-button";
import { OfflineStatus } from "@/components/offline-status";
import { CopyrightFooter } from "@/components/copyright-footer";
import { useOutbox } from "@/lib/outbox";
import { useSchoolBrand } from "@/lib/school-brand";

interface NavLink {
  href: string;
  labelKey: MessageKey;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  requiredPermission?: string;
  /** Visible dès que le compte détient l'une de ces permissions (ex. l'appel : vie scolaire ou enseignant). */
  anyPermission?: string[];
}

const LINKS: NavLink[] = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/eleves", labelKey: "nav.students", icon: GraduationCap, requiredPermission: "STUDENT_READ" },
  { href: "/eleves-par-classe", labelKey: "nav.studentsByClass", icon: School, requiredPermission: "STUDENT_READ" },
  { href: "/preinscriptions", labelKey: "nav.preregistrations", icon: UserPlus, requiredPermission: "ENROLLMENT_MANAGE" },
  { href: "/vie-scolaire", labelKey: "nav.schoolLife", icon: CalendarClock, requiredPermission: "PEDAGOGY_MANAGE" },
  { href: "/emploi-du-temps", labelKey: "nav.timetable", icon: CalendarRange, requiredPermission: "TIMETABLE_READ" },
  { href: "/appel", labelKey: "nav.attendance", icon: ClipboardCheck, anyPermission: ["ATTENDANCE_READ", "ATTENDANCE_TAKE"] },
  { href: "/notes", labelKey: "nav.grades", icon: BookOpenCheck, anyPermission: ["GRADE_ENTER", "GRADE_READ"] },
  { href: "/discipline", labelKey: "nav.discipline", icon: ShieldAlert, anyPermission: ["DISCIPLINE_REPORT", "DISCIPLINE_READ", "DISCIPLINE_DECIDE", "DISCIPLINE_CONVOKE"] },
  { href: "/cahier-de-textes", labelKey: "nav.textbook", icon: BookOpenText, anyPermission: ["TEXTBOOK_WRITE", "TEXTBOOK_READ"] },
  { href: "/pointage", labelKey: "nav.myCheckin", icon: ScanLine, requiredPermission: "TEACHER_CHECKIN_SELF" },
  { href: "/pointage-enseignants", labelKey: "nav.teacherCheckins", icon: UserCheck, requiredPermission: "TEACHER_CHECKIN_READ" },
  { href: "/portail-parents", labelKey: "nav.parentAccounts", icon: KeyRound, requiredPermission: "PARENT_ACCOUNT_MANAGE" },
  { href: "/pilotage", labelKey: "nav.pilotage", icon: Gauge, requiredPermission: "PILOTAGE_READ" },
  { href: "/messagerie", labelKey: "nav.messaging", icon: MessagesSquare, requiredPermission: "MESSAGE_USE" },
  { href: "/annonces", labelKey: "nav.announcements", icon: Megaphone, requiredPermission: "MESSAGE_USE" },
  { href: "/tarifs", labelKey: "nav.fees", icon: Receipt, requiredPermission: "FEE_MANAGE" },
  { href: "/insolvables", labelKey: "nav.insolvent", icon: AlertOctagon, requiredPermission: "FINANCE_READ" },
  { href: "/paiements-en-ligne", labelKey: "nav.onlinePayments", icon: Smartphone, requiredPermission: "FINANCE_READ" },
  { href: "/depenses", labelKey: "nav.expenses", icon: Wallet, requiredPermission: "CASH_CLOSE" },
  { href: "/cloture", labelKey: "nav.closing", icon: ClipboardList, requiredPermission: "CASH_CLOSE" },
  { href: "/parametres/annees", labelKey: "nav.years", icon: CalendarRange, requiredPermission: "SETTINGS_READ" },
  { href: "/parametres/structure", labelKey: "nav.structure", icon: Building2, requiredPermission: "SETTINGS_READ" },
  { href: "/parametres/utilisateurs", labelKey: "nav.users", icon: Users, requiredPermission: "USER_MANAGE" },
  { href: "/parametres/etablissement", labelKey: "nav.school", icon: Building2, requiredPermission: "SETTINGS_READ" },
  { href: "/hors-ligne", labelKey: "nav.sync", icon: RefreshCw },
  { href: "/audit", labelKey: "nav.audit", icon: ScrollText, requiredPermission: "AUDIT_LOG_READ" },
  { href: "/aide", labelKey: "nav.help", icon: HelpCircle },
  { href: "/liens-utiles", labelKey: "nav.usefulLinks", icon: Link2 },
  { href: "/guide", labelKey: "nav.guide", icon: LifeBuoy },
];

function Brand({ compact = false }: { compact?: boolean }) {
  const { brand, logoSrc } = useSchoolBrand();
  // Le logo de l'école, sur une pastille blanche : ses couleurs (bleu nuit, vert, or) sont faites pour un fond clair.
  if (logoSrc) {
    return (
      <div className={`flex justify-center rounded-xl bg-white shadow-sm ${compact ? "px-2 py-1" : "w-full px-3 py-2"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo servi par l'API, recadré dans le navigateur */}
        <img
          src={logoSrc}
          alt={brand?.nom ?? "Shakespeare Academy"}
          className={`w-auto max-w-full object-contain ${compact ? "h-8" : "max-h-14"}`}
        />
      </div>
    );
  }
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
  const { t } = useI18n();
  const { pending, failed } = useOutbox();
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map((link) => {
        const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href + "/"));
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
            {t(link.labelKey)}
            {link.href === "/hors-ligne" && pending + failed > 0 && (
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${failed > 0 ? "bg-danger" : "bg-info"}`}>
                {pending + failed}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleLinks = LINKS.filter(
    (link) =>
      (!link.requiredPermission || hasPermission(link.requiredPermission)) &&
      (!link.anyPermission || link.anyPermission.some((code) => hasPermission(code))),
  );

  return (
    <div className="flex min-h-screen flex-1">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 bg-primary px-4 py-6 md:flex">
        <Brand />
        <NavItems links={visibleLinks} pathname={pathname} />
        <InstallAppButton variant="dark" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du haut, mobile : marque, langue et compte, menu */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-2.5 md:hidden">
          <Brand compact />
          <div className="flex items-center gap-2">
            <UserMenu />
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label={t("shell.openMenu")}
              className="sa-interactive rounded-lg p-2 text-white hover:bg-white/10"
            >
              <Menu size={22} />
            </button>
          </div>
        </header>

        {/* Barre du haut, ordinateur : langue et compte toujours visibles, à droite */}
        <header className="sticky top-0 z-40 hidden items-center justify-end border-b border-border bg-surface/95 px-6 py-2.5 backdrop-blur md:flex">
          <UserMenu />
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
                  aria-label={t("shell.closeMenu")}
                  className="sa-interactive rounded-lg p-1.5 text-white hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
              <NavItems links={visibleLinks} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
              <InstallAppButton variant="dark" />
            </div>
          </div>
        )}

        <OfflineStatus />
        <main key={locale} className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="px-4 pb-4 sm:px-6">
          <CopyrightFooter />
        </footer>
      </div>
    </div>
  );
}
