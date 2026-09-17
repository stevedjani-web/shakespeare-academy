"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, CalendarCheck2, PlusCircle, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { AcademicYear, Student } from "@/lib/types";
import { Badge, Button, Card, PageTitle, StatCard } from "@/components/ui";

export default function DashboardHomePage() {
  const { user, hasPermission } = useAuth();
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const years = await api.get<AcademicYear[]>("/academic-years");
      setActiveYear(years.find((y) => y.statut === "ACTIVE") ?? null);
      const students = await api.get<Student[]>("/students");
      setStudentCount(students.length);
    })();
  }, []);

  return (
    <div>
      <PageTitle eyebrow="Tableau de bord" subtitle={`Bienvenue, ${user?.prenom} ${user?.nom}.`}>
        Bonjour {user?.prenom}
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Année scolaire active"
          value={activeYear ? activeYear.libelle : "Aucune"}
          tone="primary"
          icon={<CalendarCheck2 size={18} />}
          hint={!activeYear ? "Aucune inscription possible tant qu'aucune année n'est active." : undefined}
        />
        <StatCard label="Élèves enregistrés" value={studentCount ?? "…"} tone="accent" icon={<GraduationCap size={18} />} />
      </div>

      {!activeYear && (
        <Card className="mt-4 border-warning/30 bg-warning-soft/40">
          <p className="text-sm text-warning">
            <strong>Aucune année scolaire active.</strong> Rendez-vous dans « Années scolaires » pour en activer une
            avant de commencer les inscriptions.
          </p>
        </Card>
      )}

      {hasPermission("ENROLLMENT_MANAGE") && (
        <Card className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Actions rapides
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/eleves/inscription">
              <Button>
                <PlusCircle size={16} /> Nouvelle inscription / réinscription
              </Button>
            </Link>
            <Link href="/eleves">
              <Button variant="secondary">
                <Search size={16} /> Rechercher un élève
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Badge color="primary">{user?.roleCode}</Badge>
        <span>connecté(e) en tant que {user?.email}</span>
      </div>
    </div>
  );
}
