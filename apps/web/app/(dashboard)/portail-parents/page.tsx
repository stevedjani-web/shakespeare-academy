"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Search, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select, Spinner, SuccessMessage } from "@/components/ui";
import { OnboardingPanel } from "@/components/parents/onboarding-panel";
import type { OnboardingSummary } from "@/lib/parent-activation";
import type { School } from "@/lib/types";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { describeError } from "@/components/vie-scolaire/shared";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import { Rich } from "@/lib/i18n/rich";

interface GuardianRow {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  compte: { statut: "ACTIF" | "INACTIF"; activeLe: string; dernierLoginAt: string | null; consentement: { version: string; le: string } | null } | null;
  codeEnAttente: { expireLe: string } | null;
  enfants: Array<{ liaisonId: string; studentId: string; nom: string; prenom: string; matricule: string; lien: string; accesPortail: boolean; accesMotif: string | null }>;
}

interface IssuedCode {
  guardianId: string;
  code: string;
  expireLe: string;
  telephone: string;
}

// Comptes parents (Lot 11) : le secrétariat remet un code d'activation, la Direction peut retirer l'accès
// d'un responsable pour un enfant. Le code n'est affiché qu'une fois, à cet écran.
export default function PortailParentsPage() {
  const { hasPermission } = useAuth();
  const { t } = useI18n();
  const canManage = hasPermission("PARENT_ACCOUNT_MANAGE");
  const canRevoke = hasPermission("PARENT_ACCESS_REVOKE");
  const expand = useExpanded();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [etatFilter, setEtatFilter] = useState("");
  const [summary, setSummary] = useState<OnboardingSummary | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [rows, setRows] = useState<GuardianRow[] | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (classFilter) q.set("classId", classFilter);
      if (etatFilter) q.set("etat", etatFilter);
      setRows(await api.get<GuardianRow[]>(`/parent-accounts${q.size > 0 ? `?${q.toString()}` : ""}`));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [search, classFilter, etatFilter]);

  // Chiffres d'ensemble et réglages de l'école (durée des codes, en-tête des lettres).
  const loadSummary = useCallback(async () => {
    try {
      const [s, sch] = await Promise.all([api.get<OnboardingSummary>("/parent-accounts/summary"), api.get<School>("/school")]);
      setSummary(s);
      setSchool(sch);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    if (canManage) void loadSummary();
  }, [canManage, loadSummary]);

  useEffect(() => {
    if (!canManage) return;
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [canManage, load]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function issueCode(g: GuardianRow) {
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ code: string; expireLe: string; telephone: string }>(`/parent-accounts/guardians/${g.id}/activation-code`, {});
      setIssued({ guardianId: g.id, ...res });
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageTitle eyebrow={t("adm.parents.eyebrow")}>{t("adm.parents.title")}</PageTitle>
        <p className="text-sm text-ink-muted">{t("adm.parents.noPermission")}</p>
      </div>
    );
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/parents/activer` : "/parents/activer";

  return (
    <div>
      <PageTitle
        eyebrow={t("adm.parents.eyebrow")}
        subtitle={t("adm.parents.subtitle")}
        helpId="portail-parents"
      >
        {t("adm.parents.title")}
      </PageTitle>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}

      {summary && school && (
        <OnboardingPanel
          summary={summary}
          school={school}
          onChanged={() => {
            void load();
            void loadSummary();
          }}
        />
      )}

      {issued && (
        <Card className="mb-4 border-primary/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound size={16} /> {t("adm.parents.codeTitle")}
          </p>
          <p className="my-3 text-center font-mono text-3xl font-bold tracking-widest text-primary">{issued.code}</p>
          <p className="text-sm text-ink">
            <Rich
              text={t("adm.parents.codeHelp", { phone: issued.telephone, link, date: formatDate(issued.expireLe) })}
              strongClassName="font-medium"
            />
          </p>
          <p className="mt-1 text-xs text-warning">{t("adm.parents.codeWarning")}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(t("adm.parents.copyText", { code: issued.code, link }))}>
              <Copy size={16} /> {t("adm.parents.copyMessage")}
            </Button>
            <Button variant="ghost" onClick={() => setIssued(null)}>
              {t("adm.parents.close")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem]">
          <Field label={t("adm.parents.searchLabel")}>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <Input className="pl-9" placeholder={t("adm.parents.searchPh")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </Field>
          <Field label={t("adm.parents.class")}>
            <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">{t("adm.parents.allF")}</option>
              {summary?.classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.classe}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("adm.parents.state")}>
            <Select value={etatFilter} onChange={(e) => setEtatFilter(e.target.value)}>
              <option value="">{t("adm.parents.allM")}</option>
              <option value="SANS_COMPTE">{t("adm.parents.noAccount")}</option>
              <option value="CODE_EN_ATTENTE">{t("adm.parents.codePending")}</option>
              <option value="ACTIF">{t("adm.parents.accountActive")}</option>
            </Select>
          </Field>
        </div>
      </Card>

      {!rows && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t("adm.parents.loading")}
        </p>
      )}
      {rows && rows.length === 0 && <EmptyState icon={<Users />} title={t("adm.parents.empty")} description={t("adm.parents.emptyDesc")} />}

      {rows && rows.length > 0 && (
        <>
          <ExpandAll count={rows.length} onOpenAll={() => expand.openAll(rows.map((r) => r.id))} onCloseAll={expand.closeAll} />
          <ul className="space-y-2">
            {rows.map((g) => {
              const open = expand.isOpen(g.id);
              return (
                <li key={g.id} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <ExpandButton open={open} onClick={() => expand.toggle(g.id)} label={`${g.prenom} ${g.nom}`} />
                      <div>
                        <p className="font-medium text-ink">
                          {g.prenom} {g.nom}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {g.telephone} · {t("adm.parents.childCount", { n: g.enfants.length })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!g.compte && <Badge color="gray">{t("adm.parents.badgeNoAccount")}</Badge>}
                      {g.compte?.statut === "ACTIF" && <Badge color="green">{t("adm.parents.accountActive")}</Badge>}
                      {g.compte?.statut === "INACTIF" && <Badge color="red">{t("adm.parents.accountDisabled")}</Badge>}
                      {g.codeEnAttente && <Badge color="orange">{t("adm.parents.codePending")}</Badge>}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      {g.compte && (
                        <p className="text-sm text-ink-muted">
                          {t("adm.parents.activatedOn", { date: formatDate(g.compte.activeLe) })}
                          {g.compte.dernierLoginAt ? t("adm.parents.lastLoginOn", { date: formatDate(g.compte.dernierLoginAt) }) : t("adm.parents.neverLoggedIn")}
                          {g.compte.consentement ? t("adm.parents.consentOn", { date: formatDate(g.compte.consentement.le), version: g.compte.consentement.version }) : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void issueCode(g)}>
                          <KeyRound size={16} /> {g.compte ? t("adm.parents.newCode") : t("adm.parents.generateCode")}
                        </Button>
                        {g.compte?.statut === "ACTIF" && (
                          <Button
                            variant="danger"
                            onClick={() => {
                              if (confirm(t("adm.parents.confirmDeactivate", { name: `${g.prenom} ${g.nom}` }))) {
                                void run(() => api.post(`/parent-accounts/guardians/${g.id}/deactivate`, {}), t("adm.parents.deactivated"));
                              }
                            }}
                          >
                            {t("adm.parents.deactivate")}
                          </Button>
                        )}
                        {g.compte?.statut === "INACTIF" && (
                          <Button variant="secondary" onClick={() => void run(() => api.post(`/parent-accounts/guardians/${g.id}/reactivate`, {}), t("adm.parents.reactivated"))}>
                            {t("adm.parents.reactivate")}
                          </Button>
                        )}
                      </div>

                      <div>
                        <p className="mb-1.5 text-sm font-medium text-ink">{t("adm.parents.children")}</p>
                        <ul className="space-y-2">
                          {g.enfants.map((e) => (
                            <li key={e.liaisonId} className="rounded-xl bg-surface-muted p-2.5 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-ink">
                                  {e.prenom} {e.nom} <span className="text-ink-muted">· {e.matricule} · {e.lien}</span>
                                </span>
                                {e.accesPortail ? <Badge color="green">{t("adm.parents.accessGranted")}</Badge> : <Badge color="red">{t("adm.parents.accessRevoked")}</Badge>}
                              </div>
                              {!e.accesPortail && e.accesMotif && <p className="mt-1 text-xs text-ink-muted">{t("adm.parents.reason", { reason: e.accesMotif })}</p>}
                              {canRevoke && (
                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                  <Input
                                    className="!w-64"
                                    placeholder={t("adm.parents.reasonPh")}
                                    value={motifs[e.liaisonId] ?? ""}
                                    onChange={(ev) => setMotifs({ ...motifs, [e.liaisonId]: ev.target.value })}
                                  />
                                  <Button
                                    variant={e.accesPortail ? "danger" : "secondary"}
                                    disabled={!(motifs[e.liaisonId] ?? "").trim()}
                                    onClick={() =>
                                      void run(
                                        () => api.patch(`/parent-accounts/links/${e.liaisonId}/access`, { acces: !e.accesPortail, motif: motifs[e.liaisonId] }),
                                        e.accesPortail ? t("adm.parents.revokedDone") : t("adm.parents.restoredDone"),
                                      ).then(() => setMotifs((m) => ({ ...m, [e.liaisonId]: "" })))
                                    }
                                  >
                                    {e.accesPortail ? t("adm.parents.revoke") : t("adm.parents.restore")}
                                  </Button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                        {!canRevoke && <p className="mt-2 text-xs text-ink-muted">{t("adm.parents.onlyManagement")}</p>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
