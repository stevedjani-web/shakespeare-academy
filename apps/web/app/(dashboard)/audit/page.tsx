"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/types";
import { Card, PageTitle } from "@/components/ui";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [entiteFilter, setEntiteFilter] = useState("");

  useEffect(() => {
    void api.get<AuditLogEntry[]>(`/audit-logs${entiteFilter ? `?entite=${entiteFilter}` : ""}`).then(setLogs);
  }, [entiteFilter]);

  const entites = Array.from(new Set(logs.map((l) => l.entite))).sort();

  return (
    <div>
      <PageTitle subtitle="Traçabilité des actions sensibles (RG15) — journal en lecture seule, jamais modifiable.">
        Journal d&apos;audit
      </PageTitle>

      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-ink-muted">Filtrer par objet :</label>
        <select
          value={entiteFilter}
          onChange={(e) => setEntiteFilter(e.target.value)}
          className="rounded-md border border-border px-2 py-1 text-sm"
        >
          <option value="">Tous</option>
          {entites.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Utilisateur</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Objet</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border align-top">
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-muted">
                    {new Date(log.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2 pr-4">{log.user ? `${log.user.prenom} ${log.user.nom}` : "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{log.action}</td>
                  <td className="py-2 pr-4 text-ink-muted">
                    {log.entite}
                    {log.entiteId ? ` #${log.entiteId.slice(-6)}` : ""}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-muted">
                    Aucune entrée.
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
