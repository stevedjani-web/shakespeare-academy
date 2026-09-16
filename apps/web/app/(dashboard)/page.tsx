"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { AcademicYear, Student } from "@/lib/types";
import { Button, Card, PageTitle } from "@/components/ui";

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
      <PageTitle subtitle={`Bienvenue, ${user?.prenom} ${user?.nom}.`}>Tableau de bord</PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Année scolaire active</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {activeYear ? activeYear.libelle : "Aucune année active"}
          </p>
          {!activeYear && (
            <p className="mt-1 text-xs text-orange-600">
              Aucune inscription n&apos;est possible tant qu&apos;une année n&apos;est pas activée.
            </p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Élèves enregistrés</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{studentCount ?? "…"}</p>
        </Card>
      </div>

      {hasPermission("ENROLLMENT_MANAGE") && (
        <Card className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Actions rapides</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/eleves/inscription">
              <Button>Nouvelle inscription / réinscription</Button>
            </Link>
            <Link href="/eleves">
              <Button variant="secondary">Rechercher un élève</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
