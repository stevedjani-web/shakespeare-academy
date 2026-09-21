"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { ParentProvider, useParent } from "@/contexts/parent-context";
import { Button } from "@/components/ui";

function Shell({ children }: { children: React.ReactNode }) {
  const { parent, logout } = useParent();
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-bg">
      <header className="bg-primary text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/parents" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 font-display text-lg font-bold text-accent">S</span>
            <span>
              <span className="block font-display text-base font-semibold leading-tight">Shakespeare Academy</span>
              <span className="block text-[11px] uppercase tracking-wider text-white/60">Espace parents</span>
            </span>
          </Link>
          {parent && (
            <Button variant="ghost" onClick={() => void logout()} className="text-white hover:bg-white/10">
              <LogOut size={16} /> <span className="hidden sm:inline">Se déconnecter</span>
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-center text-xs text-ink-muted">
        <Link href="/parents/confidentialite" className="underline">
          Politique de confidentialité
        </Link>
      </footer>
    </div>
  );
}

// Espace des responsables d'élèves (Lot 11) : lecture seule, compte à part de celui du personnel.
export default function ParentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentProvider>
      <Shell>{children}</Shell>
    </ParentProvider>
  );
}
