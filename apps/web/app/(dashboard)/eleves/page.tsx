"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Student } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, PageTitle, Spinner } from "@/components/ui";
import { GraduationCap, Search } from "lucide-react";

function initials(nom: string, prenom: string) {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

export default function StudentsListPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api.get<Student[]>("/students").then((data) => {
      setStudents(data);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query.trim()) {
        void api.get<Student[]>("/students").then(setStudents);
        return;
      }
      setSearching(true);
      void api
        .get<Student[]>(`/students/search?q=${encodeURIComponent(query)}`)
        .then(setStudents)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageTitle
          eyebrow="Lot 2"
          subtitle="Recherche par matricule, nom, prénom, téléphone d'un responsable ou date de naissance (AAAA-MM-JJ)."
        >
          Élèves
        </PageTitle>
        {hasPermission("ENROLLMENT_MANAGE") && (
          <Link href="/eleves/inscription">
            <Button>Nouvelle inscription / réinscription</Button>
          </Link>
        )}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          placeholder="Rechercher un élève…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
        {searching && <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />}
      </div>

      {loaded && students.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={query ? "Aucun élève ne correspond à cette recherche." : "Aucun élève enregistré."}
          description={!query ? "Commencez par créer une première inscription." : undefined}
          action={
            !query && hasPermission("ENROLLMENT_MANAGE") ? (
              <Link href="/eleves/inscription">
                <Button variant="secondary">Nouvelle inscription</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop / tablette : tableau. */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-2 pr-4">Élève</th>
                    <th className="py-2 pr-4">Matricule</th>
                    <th className="py-2 pr-4">Date de naissance</th>
                    <th className="py-2 pr-4">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/eleves/${s.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted"
                    >
                      <td className="py-2.5 pr-4">
                        <Link href={`/eleves/${s.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {initials(s.nom, s.prenom)}
                          </span>
                          <span className="font-medium text-ink hover:underline">
                            {s.prenom} {s.nom}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">{s.matricule}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">
                        {new Date(s.dateNaissance).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge color={s.statut === "ACTIF" ? "green" : "gray"}>
                          {s.statut === "ACTIF" ? "Actif" : "Inactif"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile : cartes. */}
          <div className="space-y-2 sm:hidden">
            {students.map((s) => (
              <Link key={s.id} href={`/eleves/${s.id}`}>
                <Card interactive className="flex items-center gap-3 p-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                    {initials(s.nom, s.prenom)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {s.prenom} {s.nom}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {s.matricule} · {new Date(s.dateNaissance).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <Badge color={s.statut === "ACTIF" ? "green" : "gray"}>
                    {s.statut === "ACTIF" ? "Actif" : "Inactif"}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {!loaded && (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner /> Chargement…
        </div>
      )}
    </div>
  );
}
