"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isApiError } from "@/contexts/auth-context";
import type { AppUser, Permission, Role } from "@/lib/types";
import { Badge, Button, Card, ErrorMessage, Field, Input, PageTitle, Select } from "@/components/ui";

export default function UsersAndRolesPage() {
  const [tab, setTab] = useState<"users" | "roles">("users");

  return (
    <div>
      <PageTitle>Utilisateurs & rôles</PageTitle>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {(["users", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "users" ? "Utilisateurs" : "Rôles & permissions"}
          </button>
        ))}
      </div>
      {tab === "users" ? <UsersTab /> : <RolesTab />}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState({ nom: "", prenom: "", email: "", motDePasse: "", roleId: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(user: AppUser) {
    const nextStatus = user.statut === "ACTIF" ? "INACTIF" : "ACTIF";
    if (nextStatus === "INACTIF" && !confirm(`Désactiver le compte de ${user.prenom} ${user.nom} ?`)) return;
    await api.patch(`/users/${user.id}`, { statut: nextStatus });
    await load();
  }

  async function handleResetPassword(user: AppUser) {
    const nouveauMotDePasse = prompt(
      `Nouveau mot de passe temporaire pour ${user.prenom} ${user.nom} (8 caractères minimum) :`,
    );
    if (!nouveauMotDePasse) return;
    try {
      await api.patch(`/users/${user.id}/reset-password`, { nouveauMotDePasse });
      alert("Mot de passe réinitialisé. Communiquez-le à l'utilisateur ; il devra le changer à sa prochaine connexion.");
    } catch (err) {
      alert(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  return (
    <div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">E-mail</th>
                <th className="py-2 pr-4">Rôle</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    {u.prenom} {u.nom}
                  </td>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{u.role.nom}</td>
                  <td className="py-2 pr-4">
                    <Badge color={u.statut === "ACTIF" ? "green" : "gray"}>
                      {u.statut === "ACTIF" ? "Actif" : "Inactif"}
                    </Badge>
                    {u.doitChangerMotDePasse && (
                      <Badge color="orange" >
                        Doit changer son mot de passe
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => void handleToggleStatus(u)}>
                        {u.statut === "ACTIF" ? "Désactiver" : "Réactiver"}
                      </Button>
                      <Button variant="secondary" onClick={() => void handleResetPassword(u)}>
                        Réinitialiser le mot de passe
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Aucun utilisateur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6 max-w-xl">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Créer un utilisateur</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom">
              <Input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </Field>
            <Field label="Prénom">
              <Input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </Field>
          </div>
          <Field label="E-mail">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Mot de passe temporaire (8 caractères minimum)">
            <Input
              type="password"
              required
              minLength={8}
              value={form.motDePasse}
              onChange={(e) => setForm({ ...form, motDePasse: e.target.value })}
            />
          </Field>
          <Field label="Rôle">
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
            {submitting ? "Création…" : "Créer l'utilisateur"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [newRole, setNewRole] = useState({ code: "", nom: "" });
  const [error, setError] = useState<string | null>(null);

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
      setError(isApiError(err) ? err.message : "Une erreur est survenue.");
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
      alert(isApiError(err) ? err.message : "Une erreur est survenue.");
    }
  }

  return (
    <div className="space-y-6">
      {roles.map((role) => (
        <Card key={role.id}>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">{role.nom}</h3>
            {role.description && <p className="text-xs text-slate-500">{role.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {permissions.map((perm) => {
              const active = role.permissions.includes(perm.code);
              return (
                <button
                  key={perm.id}
                  onClick={() => void togglePermission(role, perm.code)}
                  title={perm.description ?? undefined}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-500 hover:border-slate-400"
                  }`}
                >
                  {perm.code}
                </button>
              );
            })}
          </div>
        </Card>
      ))}

      <Card className="max-w-lg">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Créer un rôle personnalisé</h2>
        <form onSubmit={handleCreateRole} className="flex gap-2">
          <Input
            placeholder="CODE_ROLE"
            required
            value={newRole.code}
            onChange={(e) => setNewRole({ ...newRole, code: e.target.value.toUpperCase() })}
          />
          <Input
            placeholder="Nom affiché"
            required
            value={newRole.nom}
            onChange={(e) => setNewRole({ ...newRole, nom: e.target.value })}
          />
          <Button type="submit">Créer</Button>
        </form>
        <ErrorMessage>{error}</ErrorMessage>
      </Card>
    </div>
  );
}
