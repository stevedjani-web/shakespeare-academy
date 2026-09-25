"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { AcademicYear } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle } from "@/components/ui";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { CalendarPlus, CalendarRange } from "lucide-react";

const STATUS_BADGE: Record<AcademicYear["statut"], { label: MessageKey; color: "slate" | "green" | "gray" }> = {
  BROUILLON: { label: "adm.years.status.draft", color: "slate" },
  ACTIVE: { label: "adm.years.status.active", color: "green" },
  CLOTUREE: { label: "adm.years.status.closed", color: "gray" },
};

export default function AcademicYearsPage() {
  const { hasPermission } = useAuth();
  const { t } = useI18n();
  const canManage = hasPermission("ACADEMIC_YEAR_MANAGE");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [form, setForm] = useState({ libelle: "", dateDebut: "", dateFin: "" });
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const expand = useExpanded();

  async function load() {
    const data = await api.get<AcademicYear[]>("/academic-years");
    setYears(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/academic-years", form);
      setForm({ libelle: "", dateDebut: "", dateFin: "" });
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivate(id: string) {
    setActionError(null);
    try {
      await api.post(`/academic-years/${id}/activate`);
      await load();
    } catch (err) {
      setActionError(isApiError(err) ? err.message : t("common.error"));
    }
  }

  async function handleClose(id: string) {
    setActionError(null);
    if (!confirm(t("adm.years.confirmClose"))) return;
    try {
      await api.post(`/academic-years/${id}/close`);
      await load();
    } catch (err) {
      setActionError(isApiError(err) ? err.message : t("common.error"));
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <CalendarRange size={26} />
        </span>
        <PageTitle subtitle={t("adm.years.subtitle")} helpId="parametres-annees">
          {t("adm.years.title")}
        </PageTitle>
      </div>

      <ErrorMessage>{actionError}</ErrorMessage>

      {years.length === 0 ? (
        <EmptyState icon={<CalendarRange />} title={t("adm.years.empty")} />
      ) : (
        <Card className="mt-4">
          <ExpandAll count={years.length} onOpenAll={() => expand.openAll(years.map((y) => y.id))} onCloseAll={expand.closeAll} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="w-10 py-2 pr-2" aria-label={t("adm.years.details")}></th>
                  <th className="py-2 pr-4">{t("adm.years.col.label")}</th>
                  <th className="py-2 pr-4">{t("adm.years.col.status")}</th>
                  {canManage && <th className="py-2 pr-4">{t("adm.years.col.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const expanded = expand.isOpen(year.id);
                  return (
                    <Fragment key={year.id}>
                      <tr className="border-b border-border last:border-0 hover:bg-surface-muted">
                        <td className="py-2.5 pr-2">
                          <ExpandButton open={expanded} onClick={() => expand.toggle(year.id)} label={year.libelle} />
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-ink">{year.libelle}</td>
                        <td className="py-2.5 pr-4">
                          <Badge color={STATUS_BADGE[year.statut].color}>{t(STATUS_BADGE[year.statut].label)}</Badge>
                        </td>
                        {canManage && (
                          <td className="py-2.5 pr-4">
                            <div className="flex gap-2">
                              {year.statut === "BROUILLON" && (
                                <Button variant="secondary" onClick={() => void handleActivate(year.id)}>
                                  {t("adm.years.activate")}
                                </Button>
                              )}
                              {year.statut === "ACTIVE" && (
                                <Button variant="danger" onClick={() => void handleClose(year.id)}>
                                  {t("adm.years.close")}
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border bg-surface-muted/50">
                          <td></td>
                          <td colSpan={canManage ? 3 : 2} className="py-3 pr-4">
                            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                              <p>
                                <span className="block text-xs text-ink-muted">{t("adm.years.start")}</span>
                                <span className="font-medium text-ink">{formatDate(year.dateDebut)}</span>
                              </p>
                              <p>
                                <span className="block text-xs text-ink-muted">{t("adm.years.end")}</span>
                                <span className="font-medium text-ink">{formatDate(year.dateFin)}</span>
                              </p>
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

      {canManage && (
        <Card className="mt-6 max-w-lg">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarPlus size={16} className="text-primary" /> {t("adm.years.create")}
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label={t("adm.years.labelField")}>
              <Input
                required
                value={form.libelle}
                onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("adm.years.startDate")}>
                <Input
                  type="date"
                  required
                  value={form.dateDebut}
                  onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                />
              </Field>
              <Field label={t("adm.years.endDate")}>
                <Input
                  type="date"
                  required
                  value={form.dateFin}
                  onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                />
              </Field>
            </div>
            <ErrorMessage>{error}</ErrorMessage>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("adm.years.creating") : t("adm.years.createBtn")}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
