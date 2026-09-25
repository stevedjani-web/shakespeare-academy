"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/contexts/auth-context";
import type { AppUser, Permission, Role } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";
import { KeyRound, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";
import { useI18n } from "@/lib/i18n/use-i18n";
import { INTL_LOCALE } from "@/lib/i18n/locales";

function initials(nom: string, prenom: string) {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

function UserDetails({ user }: { user: AppUser }) {
  const { t, locale } = useI18n();
  return (
    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <p>
        <span className="block text-xs text-ink-muted">{t("adm.users.email")}</span>
        <span className="break-all font-medium text-ink">{user.email}</span>
      </p>
      <p>
        <span className="block text-xs text-ink-muted">{t("adm.users.role")}</span>
        <span className="font-medium text-ink">{user.role.nom}</span>
      </p>
      <p>
        <span className="block text-xs text-ink-muted">{t("adm.users.lastLogin")}</span>
        <span className="font-medium text-ink">
          {user.dernierLoginAt ? new Date(user.dernierLoginAt).toLocaleString(INTL_LOCALE[locale]) : t("adm.users.never")}
        </span>
      </p>
      {user.doitChangerMotDePasse && (
        <p className="flex items-end">
          <Badge color="orange">{t("adm.users.mustChange")}</Badge>
        </p>
      )}
    </div>
  );
}

export default function UsersAndRolesPage() {
  const { hasPermission } = useAuth();
  const { t } = useI18n();
  // La Direction gère les comptes (dont ceux qui portent des droits réservés) mais pas les rôles : ROLE_MANAGE.
  const canManageRoles = hasPermission("ROLE_MANAGE");
  const [tab, setTab] = useState<"users" | "roles">("users");

  return (
    <div>
      <PageTitle
        eyebrow={t("adm.users.eyebrow")}
        subtitle={t("adm.users.subtitle")}
        helpId="parametres-utilisateurs"
      >
        {t("adm.users.title")}
      </PageTitle>
      {canManageRoles && (
      <div className="mb-6 inline-flex gap-1 rounded-full border border-border bg-surface-muted p-1">
        {(
          [
            { key: "users", label: t("adm.users.tabUsers"), icon: UserCog },
            { key: "roles", label: t("adm.users.tabRoles"), icon: ShieldCheck },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      )}
      {tab === "users" || !canManageRoles ? <UsersTab /> : <RolesTab />}
    </div>
  );
}

function UsersTab() {
  const { t, locale } = useI18n();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState({ nom: "", prenom: "", email: "", motDePasse: "", roleId: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const expand = useExpanded();

  async function load() {
    const [u, r] = await Promise.all([api.get<AppUser[]>("/users"), api.get<Role[]>("/roles")]);
    setUsers(u);
    setRoles(r);
    setForm((f) => ({ ...f, roleId: f.roleId || r[0]?.id || "" }));
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/users", form);
      setForm({ nom: "", prenom: "", email: "", motDePasse: "", roleId: form.roleId });
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(user: AppUser) {
    const nextStatus = user.statut === "ACTIF" ? "INACTIF" : "ACTIF";
    if (nextStatus === "INACTIF" && !confirm(t("adm.users.confirmDeactivate", { name: `${user.prenom} ${user.nom}` }))) return;
    await api.patch(`/users/${user.id}`, { statut: nextStatus });
    await load();
  }

  async function handleResetPassword(user: AppUser) {
    const nouveauMotDePasse = prompt(
      t("adm.users.promptPassword", { name: `${user.prenom} ${user.nom}` }),
    );
    if (!nouveauMotDePasse) return;
    try {
      await api.patch(`/users/${user.id}/reset-password`, { nouveauMotDePasse });
      alert(t("adm.users.resetDone"));
    } catch (err) {
      alert(isApiError(err) ? err.message : t("common.error"));
    }
  }

  return (
    <div>
      {users.length > 0 && (
        <div className="mb-3 flex justify-end">
          <ExportButtons
            fileName={t("adm.users.exportFile")}
            title={t("adm.users.exportTitle")}
            sections={[
              buildSection(
                t("adm.users.exportTitle"),
                [
                  { header: t("adm.users.colName"), value: (u: AppUser) => u.nom },
                  { header: t("adm.users.colFirstName"), value: (u: AppUser) => u.prenom },
                  { header: t("adm.users.email"), value: (u: AppUser) => u.email },
                  { header: t("adm.users.role"), value: (u: AppUser) => u.role.nom },
                  { header: t("adm.users.colStatus"), value: (u: AppUser) => (u.statut === "ACTIF" ? t("adm.users.active") : t("adm.users.inactive")) },
                  { header: t("adm.users.lastLogin"), value: (u: AppUser) => (u.dernierLoginAt ? new Date(u.dernierLoginAt).toLocaleString(INTL_LOCALE[locale]) : "") },
                ],
                users,
              ),
            ]}
          />
        </div>
      )}
      {users.length === 0 ? (
        <EmptyState icon={<Users />} title={t("adm.users.empty")} description={t("adm.users.emptyDesc")} />
      ) : (
        <>
          <Card className="hidden sm:block">
            <ExpandAll count={users.length} onOpenAll={() => expand.openAll(users.map((u) => u.id))} onCloseAll={expand.closeAll} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="w-10 py-2 pr-2" aria-label={t("adm.users.details")}></th>
                    <th className="py-2 pr-4">{t("adm.users.colName")}</th>
                    <th className="py-2 pr-4">{t("adm.users.colStatus")}</th>
                    <th className="py-2 pr-4">{t("adm.users.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const expanded = expand.isOpen(u.id);
                    return (
                      <Fragment key={u.id}>
                        <tr className="border-b border-border last:border-0 hover:bg-surface-muted">
                          <td className="py-2.5 pr-2">
                            <ExpandButton open={expanded} onClick={() => expand.toggle(u.id)} label={`${u.prenom} ${u.nom}`} />
                          </td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                                {initials(u.nom, u.prenom)}
                              </span>
                              <span className="font-medium text-ink">
                                {u.prenom} {u.nom}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge color={u.statut === "ACTIF" ? "green" : "gray"}>
                              {u.statut === "ACTIF" ? t("adm.users.active") : t("adm.users.inactive")}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" onClick={() => void handleToggleStatus(u)}>
                                {u.statut === "ACTIF" ? t("adm.users.deactivate") : t("adm.users.reactivate")}
                              </Button>
                              <Button variant="secondary" onClick={() => void handleResetPassword(u)}>
                                <KeyRound size={14} /> {t("adm.users.reset")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-border bg-surface-muted/50">
                            <td></td>
                            <td colSpan={3} className="py-3 pr-4">
                              <UserDetails user={u} />
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

          <div className="space-y-2 sm:hidden">
            <ExpandAll count={users.length} onOpenAll={() => expand.openAll(users.map((u) => u.id))} onCloseAll={expand.closeAll} />
            {users.map((u) => {
              const expanded = expand.isOpen(u.id);
              return (
                <Card key={u.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <ExpandButton open={expanded} onClick={() => expand.toggle(u.id)} label={`${u.prenom} ${u.nom}`} />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                      {initials(u.nom, u.prenom)}
                    </span>
                    <p className="min-w-0 flex-1 truncate font-medium text-ink">
                      {u.prenom} {u.nom}
                    </p>
                    <Badge color={u.statut === "ACTIF" ? "green" : "gray"}>
                      {u.statut === "ACTIF" ? t("adm.users.active") : t("adm.users.inactive")}
                    </Badge>
                  </div>
                  {expanded && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <UserDetails user={u} />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => void handleToggleStatus(u)}>
                          {u.statut === "ACTIF" ? t("adm.users.deactivate") : t("adm.users.reactivate")}
                        </Button>
                        <Button variant="secondary" onClick={() => void handleResetPassword(u)}>
                          <KeyRound size={14} /> {t("adm.users.reset")}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Card className="mt-6 max-w-xl">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <UserPlus size={16} className="text-primary" /> {t("adm.users.create")}
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("adm.users.colName")}>
              <Input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </Field>
            <Field label={t("adm.users.colFirstName")}>
              <Input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </Field>
          </div>
          <Field label={t("adm.users.email")}>
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={t("adm.users.tempPassword")}>
            <Input
              type="password"
              required
              minLength={8}
              value={form.motDePasse}
              onChange={(e) => setForm({ ...form, motDePasse: e.target.value })}
            />
          </Field>
          <Field label={t("adm.users.role")}>
            <Select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nom}
                </option>
              ))}
            </Select>
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={submitting}>
            {submitting ? t("adm.users.creating") : t("adm.users.createBtn")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function RolesTab() {
  const { t } = useI18n();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [newRole, setNewRole] = useState({ code: "", nom: "" });
  const [error, setError] = useState<string | null>(null);
  const expand = useExpanded();

  async function load() {
    const [r, p] = await Promise.all([api.get<Role[]>("/roles"), api.get<Permission[]>("/permissions")]);
    setRoles(r);
    setPermissions(p);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/roles", newRole);
      setNewRole({ code: "", nom: "" });
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : t("common.error"));
    }
  }

  async function togglePermission(role: Role, code: string) {
    const next = role.permissions.includes(code)
      ? role.permissions.filter((p) => p !== code)
      : [...role.permissions, code];
    try {
      await api.put(`/roles/${role.id}/permissions`, { permissionCodes: next });
      await load();
    } catch (err) {
      alert(isApiError(err) ? err.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-4">
      <ExpandAll count={roles.length} onOpenAll={() => expand.openAll(roles.map((r) => r.id))} onCloseAll={expand.closeAll} />
      {roles.map((role) => {
        const expanded = expand.isOpen(role.id);
        return (
          <Card key={role.id}>
            <div className="flex items-center gap-2.5">
              <ExpandButton open={expanded} onClick={() => expand.toggle(role.id)} label={role.nom} />
              <ShieldCheck size={16} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-ink">{role.nom}</h3>
                {role.description && <p className="text-xs text-ink-muted">{role.description}</p>}
              </div>
              <Badge color="slate">{t("adm.users.permCount", { n: role.permissions.length })}</Badge>
            </div>
            {expanded && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {permissions.map((perm) => {
                  const active = role.permissions.includes(perm.code);
                  return (
                    <button
                      key={perm.id}
                      onClick={() => void togglePermission(role, perm.code)}
                      title={perm.description ?? undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface text-ink-muted hover:border-primary/40"
                      }`}
                    >
                      {perm.code}
                    </button>
                  );
                })}
                {permissions.length === 0 && <p className="text-xs text-ink-muted">{t("adm.users.noPerm")}</p>}
              </div>
            )}
          </Card>
        );
      })}

      <Card className="max-w-lg">
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("adm.users.createRole")}</h2>
        <form onSubmit={handleCreateRole} className="flex flex-wrap gap-2">
          <Input
            placeholder="CODE_ROLE"
            required
            value={newRole.code}
            onChange={(e) => setNewRole({ ...newRole, code: e.target.value.toUpperCase() })}
          />
          <Input
            placeholder={t("adm.users.displayName")}
            required
            value={newRole.nom}
            onChange={(e) => setNewRole({ ...newRole, nom: e.target.value })}
          />
          <Button type="submit">{t("adm.users.createRoleBtn")}</Button>
        </form>
        <ErrorMessage>{error}</ErrorMessage>
      </Card>
    </div>
  );
}
