"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Student } from "@/lib/types";
import { Badge, Button, Card, Input, PageTitle } from "@/components/ui";

export default function StudentsListPage() {
  const { hasPermission } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    void api.get<Student[]>("/students").then(setStudents);
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
      <div className="mb-6 flex items-center justify-between">
        <PageTitle subtitle="Recherche par matricule, nom, prénom, téléphone d'un responsable ou date de naissance (AAAA-MM-JJ).">
          Élèves
        </PageTitle>
        {hasPermission("ENROLLMENT_MANAGE") && (
          <Link href="/eleves/inscription">
            <Button>Nouvelle inscription / réinscription</Button>
          </Link>
        )}
      </div>

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Rechercher un élève…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4">Matricule</th>
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Prénom</th>
                <th className="py-2 pr-4">Date de naissance</th>
                <th className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/eleves/${s.id}`} className="font-mono text-xs text-slate-500 hover:underline">
                      {s.matricule}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/eleves/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.nom}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{s.prenom}</td>
                  <td className="py-2 pr-4">{new Date(s.dateNaissance).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 pr-4">
                    <Badge color={s.statut === "ACTIF" ? "green" : "gray"}>
                      {s.statut === "ACTIF" ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {students.length === 0 && !searching && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Aucun élève trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
