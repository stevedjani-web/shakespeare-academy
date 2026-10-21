"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ClipboardList, KeyRound, LogIn, Search, UserX, Users, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import { describeError } from "@/components/vie-scolaire/shared";
import { Badge, Card, EmptyState, ErrorMessage, Input, PageTitle, Select, Spinner, StatCard } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { buildSection } from "@/lib/export";
import { INTL_LOCALE } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  activityState,
  classesOf,
  filterParents,
  parentName,
  relativeTime,
  type ActivityChild,
  type ActivityOverview,
  type ActivityParent,
  type ActivityState,
  type ActivityStateFilter,
  type LoginHistory,
} from "@/lib/parent-activity";

const PERIODS = [7, 30, 90] as const;
type Tab = "parents" | "history";

const STATE_BADGE: Record<ActivityState, "red" | "green" | "orange" | "gray"> = {
  never: "red",
  connected: "green",
  away: "orange",
  disabled: "gray",
};

function ChildrenList({ kids }: { kids: ActivityChild[] }) {
  const { t } = useI18n();
  if (kids.length === 0) return <span className="text-xs text-ink-muted">{t("adm.act.noChildren")}</span>;
  return (
    <ul className="space-y-0.5">
      {kids.map((c) => (
        <li key={c.id} className="text-sm text-ink">
          {c.prenom} {c.nom}
          {c.classe && <span className="ml-1.5 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs text-ink-muted">{c.classe}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function ParentActivityPage() {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [days, setDays] = useState<number>(30);
  const [tab, setTab] = useState<Tab>("parents");
  const [overview, setOverview] = useState<ActivityOverview | null>(null);
  const [history, setHistory] = useState<LoginHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ActivityStateFilter>("all");
  const [classe, setClasse] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, h] = await Promise.all([
        api.get<ActivityOverview>(`/parent-activity?jours=${days}`),
        api.get<LoginHistory>(`/parent-activity/logins?jours=${days}&limite=500`),
      ]);
      setOverview(o);
      setHistory(h);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), [overview]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = useCallback(
    (iso: string) => new Date(iso).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" }),
    [intl],
  );
  const stateLabel = (s: ActivityState) =>
    ({ never: t("adm.act.badgeNever"), connected: t("adm.act.badgeConnected"), away: t("adm.act.badgeAway"), disabled: t("adm.act.badgeDisabled") })[s];

  const rows = useMemo(
    () => (overview ? filterParents(overview.parents, { query, state, classe }) : []),
    [overview, query, state, classe],
  );
  const classes = useMemo(() => (overview ? classesOf(overview.parents) : []), [overview]);
  const r = overview?.resume;
  const pct = r && r.actifs > 0 ? Math.round((r.connectesPeriode / r.actifs) * 100) : 0;

  const lastLogin = (p: ActivityParent) =>
    p.dernierLoginAt ? `${relativeTime(p.dernierLoginAt, now, intl)} · ${fmt(p.dernierLoginAt)}` : t("adm.act.never");

  return (
    <div>
      <PageTitle helpId="activite-parents" subtitle={t("adm.act.subtitle")}>
        {t("adm.act.title")}
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink-muted">{t("adm.act.period")}</span>
        <div className="inline-flex overflow-hidden rounded-xl border border-border" role="group" aria-label={t("adm.act.period")}>
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`px-3.5 py-2 text-sm font-medium transition-colors ${days === d ? "bg-primary text-white" : "bg-surface text-ink hover:bg-surface-muted"}`}
            >
              {t("adm.act.days", { n: d })}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-sm">
          <Link href="/collecte" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <ClipboardList size={15} /> {t("adm.act.linkCollect")}
          </Link>
          <Link href="/portail-parents" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <KeyRound size={15} /> {t("adm.act.linkCodes")}
          </Link>
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {loading && !overview && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {r && overview && history && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label={t("adm.act.statActive")} value={r.actifs} hint={t("adm.act.statActiveHint", { n: r.comptes })} tone="primary" icon={<Users size={18} />} />
            <StatCard
              label={t("adm.act.statConnected")}
              value={r.connectesPeriode}
              hint={t("adm.act.statConnectedHint", { pct })}
              tone="success"
              icon={<LogIn size={18} />}
              progress={pct}
            />
            <StatCard label={t("adm.act.statLogins")} value={r.connexionsPeriode} hint={t("adm.act.statLoginsHint", { n: overview.jours })} tone="info" icon={<Activity size={18} />} />
            <StatCard label={t("adm.act.statNever")} value={r.jamaisConnectes} hint={t("adm.act.statNeverHint")} tone="danger" icon={<UserX size={18} />} />
            <StatCard label={t("adm.act.statAway")} value={r.inactifsPeriode} hint={t("adm.act.statAwayHint")} tone="warning" icon={<UserMinus size={18} />} />
          </div>

          <div className="mb-4 flex flex-wrap gap-2 border-b border-border" role="tablist">
            {(["parents", "history"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                {k === "parents" ? t("adm.act.tabParents") : t("adm.act.tabHistory")}
              </button>
            ))}
          </div>

          {tab === "parents" && (
            <Card>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="relative min-w-[14rem] flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("adm.act.search")} className="pl-9" aria-label={t("adm.act.search")} />
                </div>
                <div className="w-full sm:w-56">
                  <Select value={state} onChange={(e) => setState(e.target.value as ActivityStateFilter)} aria-label={t("adm.act.filterState")}>
                    <option value="all">{t("adm.act.stateAll")}</option>
                    <option value="never">{t("adm.act.stateNever")}</option>
                    <option value="connected">{t("adm.act.stateConnected")}</option>
                    <option value="away">{t("adm.act.stateAway")}</option>
                    <option value="disabled">{t("adm.act.stateDisabled")}</option>
                  </Select>
                </div>
                <div className="w-full sm:w-44">
                  <Select value={classe} onChange={(e) => setClasse(e.target.value)} aria-label={t("adm.act.filterClass")}>
                    <option value="">{t("adm.act.classAll")}</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <ExportButtons
                  fileName={t("adm.act.exportParentsFile")}
                  title={t("adm.act.exportParentsTitle")}
                  subtitle={t("adm.act.exportSubtitle", { n: overview.jours })}
                  landscape
                  disabled={rows.length === 0}
                  sections={[
                    buildSection(
                      t("adm.act.exportParentsTitle"),
                      [
                        { header: t("adm.act.colParent"), value: (p: ActivityParent) => parentName(p) },
                        { header: t("adm.act.colPhone"), value: (p: ActivityParent) => p.telephone ?? "" },
                        { header: t("adm.act.colChildren"), value: (p: ActivityParent) => p.enfants.map((c) => `${c.prenom} ${c.nom}${c.classe ? ` (${c.classe})` : ""}`).join(", ") },
                        { header: t("adm.act.colLast"), value: (p: ActivityParent) => (p.dernierLoginAt ? fmt(p.dernierLoginAt) : t("adm.act.never")) },
                        { header: t("adm.act.colCount"), value: (p: ActivityParent) => p.connexions, kind: "number" },
                        { header: t("adm.act.colState"), value: (p: ActivityParent) => stateLabel(activityState(p)) },
                      ],
                      rows,
                    ),
                  ]}
                />
              </div>

              {rows.length === 0 ? (
                <EmptyState icon={<Users size={22} />} title={t("adm.act.parentsEmpty")} />
              ) : (
                <>
                  {/* Cartes sur téléphone */}
                  <ul className="space-y-3 sm:hidden">
                    {rows.map((p) => {
                      const s = activityState(p);
                      return (
                        <li key={p.accountId} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{parentName(p) || "—"}</p>
                              <p className="text-xs text-ink-muted">{p.telephone}</p>
                            </div>
                            <Badge color={STATE_BADGE[s]}>{stateLabel(s)}</Badge>
                          </div>
                          <div className="mt-2">
                            <ChildrenList kids={p.enfants} />
                          </div>
                          <p className="mt-2 text-xs text-ink-muted">
                            {t("adm.act.colLast")} : {lastLogin(p)} · {t("adm.act.colCount")} : {p.connexions}
                          </p>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Tableau sur ordinateur */}
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-ink-muted">
                          <th className="py-2 pr-4">{t("adm.act.colParent")}</th>
                          <th className="py-2 pr-4">{t("adm.act.colChildren")}</th>
                          <th className="py-2 pr-4">{t("adm.act.colLast")}</th>
                          <th className="py-2 pr-4 text-right">{t("adm.act.colCount")}</th>
                          <th className="py-2">{t("adm.act.colState")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p) => {
                          const s = activityState(p);
                          return (
                            <tr key={p.accountId} className="border-b border-border align-top">
                              <td className="py-2.5 pr-4">
                                <p className="font-medium text-ink">{parentName(p) || "—"}</p>
                                <p className="text-xs text-ink-muted">{p.telephone}</p>
                              </td>
                              <td className="py-2.5 pr-4">
                                <ChildrenList kids={p.enfants} />
                              </td>
                              <td className="py-2.5 pr-4 text-ink">{lastLogin(p)}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{p.connexions}</td>
                              <td className="py-2.5">
                                <Badge color={STATE_BADGE[s]}>{stateLabel(s)}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          )}

          {tab === "history" && (
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-muted">{t("adm.act.historyShown", { shown: history.affiches, total: history.total })}</p>
                <ExportButtons
                  fileName={t("adm.act.exportHistoryFile")}
                  title={t("adm.act.exportHistoryTitle")}
                  subtitle={t("adm.act.exportSubtitle", { n: history.jours })}
                  landscape
                  disabled={history.evenements.length === 0}
                  sections={[
                    buildSection(
                      t("adm.act.exportHistoryTitle"),
                      [
                        { header: t("adm.act.colDate"), value: (e: LoginHistory["evenements"][number]) => fmt(e.le) },
                        { header: t("adm.act.colParent"), value: (e: LoginHistory["evenements"][number]) => parentName(e) },
                        { header: t("adm.act.colPhone"), value: (e: LoginHistory["evenements"][number]) => e.telephone ?? "" },
                        { header: t("adm.act.colChildren"), value: (e: LoginHistory["evenements"][number]) => e.enfants.map((c) => `${c.prenom} ${c.nom}${c.classe ? ` (${c.classe})` : ""}`).join(", ") },
                      ],
                      history.evenements,
                    ),
                  ]}
                />
              </div>

              {history.evenements.length === 0 ? (
                <EmptyState icon={<LogIn size={22} />} title={t("adm.act.historyEmpty")} />
              ) : (
                <>
                  <ul className="space-y-3 sm:hidden">
                    {history.evenements.map((e) => (
                      <li key={e.id} className="rounded-xl border border-border p-3">
                        <p className="text-xs font-medium text-ink-muted">{fmt(e.le)}</p>
                        <p className="mt-0.5 font-medium text-ink">{parentName(e) || "—"}</p>
                        <p className="text-xs text-ink-muted">{e.telephone}</p>
                        <div className="mt-2">
                          <ChildrenList kids={e.enfants} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-ink-muted">
                          <th className="py-2 pr-4">{t("adm.act.colDate")}</th>
                          <th className="py-2 pr-4">{t("adm.act.colParent")}</th>
                          <th className="py-2">{t("adm.act.colChildren")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.evenements.map((e) => (
                          <tr key={e.id} className="border-b border-border align-top">
                            <td className="whitespace-nowrap py-2.5 pr-4 text-ink">{fmt(e.le)}</td>
                            <td className="py-2.5 pr-4">
                              <p className="font-medium text-ink">{parentName(e) || "—"}</p>
                              <p className="text-xs text-ink-muted">{e.telephone}</p>
                            </td>
                            <td className="py-2.5">
                              <ChildrenList kids={e.enfants} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          )}

          <p className="mt-4 max-w-3xl text-xs text-ink-muted">{t("adm.act.note")}</p>
        </>
      )}
    </div>
  );
}
