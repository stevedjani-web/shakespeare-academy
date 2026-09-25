"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/types";
import { Badge, Card, EmptyState, PageTitle, Select } from "@/components/ui";
import { ScrollText } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";

function actionColor(action: string): "green" | "blue" | "orange" | "red" | "slate" {
  if (action.endsWith("_CREATE") || action.endsWith("_APPROVE") || action.endsWith("_REQUEST")) return "green";
  if (action.endsWith("_UPDATE")) return "blue";
  if (action.endsWith("_CANCEL") || action.endsWith("_REJECT")) return "orange";
  if (action.endsWith("_DELETE")) return "red";
  return "slate";
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-ink-muted">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-xl bg-surface p-3 text-xs text-ink ring-1 ring-border">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditLogPage() {
  const { t, locale } = useI18n();
  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(INTL_LOCALE[locale]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [entiteFilter, setEntiteFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const expand = useExpanded();

  useEffect(() => {
    void api.get<AuditLogEntry[]>(`/audit-logs${entiteFilter ? `?entite=${entiteFilter}` : ""}`).then((data) => {
      setLogs(data);
      setLoaded(true);
    });
  }, [entiteFilter]);

  const entites = Array.from(new Set(logs.map((l) => l.entite))).sort();

  return (
    <div>
      <PageTitle
        eyebrow={t("adm.audit.eyebrow")}
        subtitle={t("adm.audit.subtitle")}
        helpId="audit"
      >
        {t("adm.audit.title")}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex max-w-xs items-center gap-2">
        <label className="shrink-0 text-sm text-ink-muted">{t("adm.audit.objectColon")}</label>
        <Select value={entiteFilter} onChange={(e) => setEntiteFilter(e.target.value)}>
          <option value="">{t("adm.audit.all")}</option>
          {entites.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
      </div>
        <ExportButtons
          fileName={t("adm.audit.exportFile")}
          title={t("adm.audit.title")}
          landscape
          disabled={!loaded}
          sections={[
            buildSection(
              t("adm.audit.title"),
              [
                { header: t("adm.audit.colDate"), value: (l: AuditLogEntry) => fmtDateTime(l.createdAt) },
                { header: t("adm.audit.colUser"), value: (l: AuditLogEntry) => (l.user ? `${l.user.prenom} ${l.user.nom}` : "") },
                { header: t("adm.audit.colAction"), value: (l: AuditLogEntry) => l.action },
                { header: t("adm.audit.colObject"), value: (l: AuditLogEntry) => l.entite },
                { header: t("adm.audit.reference"), value: (l: AuditLogEntry) => l.entiteId ?? "" },
              ],
              logs,
            ),
          ]}
        />
      </div>

      {loaded && logs.length === 0 ? (
        <EmptyState icon={<ScrollText />} title={t("adm.audit.empty")} description={t("adm.audit.emptyDesc")} />
      ) : (
        <Card>
          <ExpandAll count={logs.length} onOpenAll={() => expand.openAll(logs.map((l) => l.id))} onCloseAll={expand.closeAll} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="w-10 py-2 pr-2" aria-label={t("adm.audit.details")}></th>
                  <th className="py-2 pr-4">{t("adm.audit.colDate")}</th>
                  <th className="py-2 pr-4">{t("adm.audit.colUser")}</th>
                  <th className="py-2 pr-4">{t("adm.audit.colAction")}</th>
                  <th className="py-2 pr-4">{t("adm.audit.colObject")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const expanded = expand.isOpen(log.id);
                  const who = log.user ? `${log.user.prenom} ${log.user.nom}` : "-";
                  return (
                    <Fragment key={log.id}>
                      <tr className="border-b border-border align-top last:border-0 hover:bg-surface-muted">
                        <td className="py-2.5 pr-2">
                          <ExpandButton open={expanded} onClick={() => expand.toggle(log.id)} label={t("adm.audit.rowLabel", { action: log.action, date: fmtDateTime(log.createdAt) })} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-ink-muted">
                          {fmtDateTime(log.createdAt)}
                        </td>
                        <td className="py-2.5 pr-4 text-ink">{who}</td>
                        <td className="py-2.5 pr-4">
                          <Badge color={actionColor(log.action)}>{log.action}</Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-ink-muted">
                          {log.entite}
                          {log.entiteId ? ` #${log.entiteId.slice(-6)}` : ""}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border bg-surface-muted/50">
                          <td></td>
                          <td colSpan={4} className="py-3 pr-4">
                            <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                              <p>
                                <span className="block text-xs text-ink-muted">{t("adm.audit.colObject")}</span>
                                <span className="font-medium text-ink">{log.entite}</span>
                              </p>
                              <p>
                                <span className="block text-xs text-ink-muted">{t("adm.audit.reference")}</span>
                                <span className="break-all font-mono text-xs font-medium text-ink">{log.entiteId ?? "-"}</span>
                              </p>
                              <p className="sm:col-span-2">
                                <span className="block text-xs text-ink-muted">{t("adm.audit.colUser")}</span>
                                <span className="font-medium text-ink">
                                  {who}
                                  {log.user ? ` (${log.user.email})` : ""}
                                </span>
                              </p>
                              <ValueBlock label={t("adm.audit.before")} value={log.ancienneValeur} />
                              <ValueBlock label={t("adm.audit.after")} value={log.nouvelleValeur} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
