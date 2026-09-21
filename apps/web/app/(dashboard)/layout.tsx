"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // On garde l'adresse demandée (par exemple un QR de pointage scanné) pour y revenir après la connexion.
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(here && here !== "/" ? `/login?next=${encodeURIComponent(here)}` : "/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-bg">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
