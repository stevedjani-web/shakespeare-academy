"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, isOfflineError, sendWithKey } from "@/lib/api";
import { dbDelete, dbGet, dbPut, dbValues } from "@/lib/offline-db";
import { isOnline } from "@/lib/connectivity";
import { translate } from "@/lib/i18n";

// File d'attente des saisies faites sans Internet (D49). Chaque entrée est une vraie requête
// d'écriture, rejouée dans l'ordre au retour du réseau avec sa clé d'idempotence (jamais deux fois
// la même saisie). Elle survit à la fermeture de l'application ET à la déconnexion : ce sont des
// opérations réelles (encaissements compris) qui ne doivent jamais se perdre en silence.

export type OutboxKind =
  | "payment"
  | "expense"
  | "discount"
  | "student"
  | "student-update"
  | "guardian"
  | "enrollment"
  | "attendance"
  | "checkin"
  | "grades"
  | "textbook";
export type OutboxStatus = "pending" | "done" | "failed";

/** Reçu provisoire remis au parent (encaissement hors ligne) : tout ce qui s'imprime dessus. */
export interface ProvisionalReceipt {
  numero: string;
  eleve: string;
  matricule: string;
  classe: string;
  motif: string;
  montant: number;
  modePaiement: string;
  referenceExterne?: string;
  caissier: string;
  date: string;
}

export interface OutboxEntry {
  id: string;
  key: string;
  kind: OutboxKind;
  method: "POST" | "PATCH";
  path: string;
  body: unknown;
  label: string;
  userId: string;
  userName: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  error?: string;
  /** Identifiant renvoyé par le serveur une fois la saisie synchronisée. */
  resultId?: string;
  /** Numéro officiel (REC-xxxxxx) une fois un encaissement synchronisé. */
  resultNumero?: string;
  dependsOn?: string[];
  studentId?: string;
  invoiceLineId?: string;
  montant?: number;
  receipt?: ProvisionalReceipt;
}

// Le motif « dépend d'une saisie en échec » est écrit dans la langue de l'interface au moment de l'échec : pour le
// reconnaître plus tard (la langue a pu changer entre-temps), on le compare aux deux versions.
function isDependencyError(error: string | undefined): boolean {
  return error === translate("adm.sync.errDependency", undefined, "fr") || error === translate("adm.sync.errDependency", undefined, "en");
}

const REF_PREFIX = "$ref:";
const MAX_ATTEMPTS = 5;

let current: { id: string; name: string } | null = null;
let running = false;

export function setOutboxUser(user: { id: string; name: string } | null): void {
  current = user;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function refOf(entryId: string): string {
  return `${REF_PREFIX}${entryId}`;
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sa-outbox"));
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await dbValues<OutboxEntry>("outbox");
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getEntry(id: string): Promise<OutboxEntry | undefined> {
  return dbGet<OutboxEntry>("outbox", id);
}

async function save(entry: OutboxEntry): Promise<void> {
  await dbPut("outbox", entry.id, entry);
  notify();
}

export interface EnqueueInput {
  kind: OutboxKind;
  method: "POST" | "PATCH";
  path: string;
  body: unknown;
  label: string;
  key?: string;
  id?: string;
  dependsOn?: string[];
  studentId?: string;
  invoiceLineId?: string;
  montant?: number;
  receipt?: ProvisionalReceipt;
}

export async function enqueue(input: EnqueueInput): Promise<OutboxEntry> {
  if (!current) throw new Error(translate("adm.sync.errNoUser"));
  const entry: OutboxEntry = {
    id: input.id ?? newId(),
    key: input.key ?? newId(),
    kind: input.kind,
    method: input.method,
    path: input.path,
    body: input.body,
    label: input.label,
    userId: current.id,
    userName: current.name,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    dependsOn: input.dependsOn,
    studentId: input.studentId,
    invoiceLineId: input.invoiceLineId,
    montant: input.montant,
    receipt: input.receipt,
  };
  await save(entry);
  return entry;
}

function substitute<T>(value: T, results: Map<string, string>): T {
  if (typeof value === "string") {
    let out: string = value;
    if (out.includes(REF_PREFIX)) {
      out = out.replace(/\$ref:([A-Za-z0-9_-]+)/g, (whole, id: string) => results.get(id) ?? whole);
    }
    return out as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, results)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitute(v, results)])) as T;
  }
  return value;
}

export async function retryEntry(id: string, patchBody?: (body: unknown) => unknown): Promise<void> {
  const entry = await getEntry(id);
  if (!entry || entry.status !== "failed") return;
  await save({
    ...entry,
    status: "pending",
    error: undefined,
    attempts: 0,
    body: patchBody ? patchBody(entry.body) : entry.body,
  });
  // Les saisies qui n'avaient échoué que parce qu'elles dépendaient de celle-ci repartent avec elle.
  for (const other of await listOutbox()) {
    if (other.status === "failed" && other.dependsOn?.includes(id) && isDependencyError(other.error)) {
      await save({ ...other, status: "pending", error: undefined, attempts: 0 });
    }
  }
  void processOutbox();
}

export async function discardEntry(id: string): Promise<void> {
  const entry = await getEntry(id);
  if (!entry || entry.status === "pending") return;
  await dbDelete("outbox", id);
  notify();
}

/** Envoie, dans l'ordre, les saisies en attente. Sans effet hors ligne ou si un envoi est déjà en cours. */
export async function processOutbox(): Promise<void> {
  if (running || !current || !isOnline()) return;
  running = true;
  try {
    const entries = await listOutbox();
    const results = new Map<string, string>();
    for (const e of entries) if (e.status === "done" && e.resultId) results.set(e.id, e.resultId);
    const byId = new Map(entries.map((e) => [e.id, e]));

    for (const entry of entries) {
      if (entry.status !== "pending") continue;
      // Une saisie n'est envoyée que par le compte qui l'a faite : le reçu et le journal d'audit
      // doivent nommer la bonne personne.
      if (entry.userId !== current.id) continue;

      const deps = (entry.dependsOn ?? []).map((d) => byId.get(d));
      if (deps.some((d) => d && d.status === "failed")) {
        await save({ ...entry, status: "failed", error: translate("adm.sync.errDependency") });
        continue;
      }
      if (deps.some((d) => !d || d.status !== "done")) continue;

      try {
        const res = await sendWithKey<{ id?: string; numeroRecu?: string }>(
          entry.method,
          substitute(entry.path, results),
          substitute(entry.body, results),
          entry.key,
        );
        const done: OutboxEntry = {
          ...entry,
          status: "done",
          error: undefined,
          resultId: res?.id ?? entry.resultId,
          resultNumero: res?.numeroRecu,
        };
        byId.set(entry.id, done);
        if (done.resultId) results.set(entry.id, done.resultId);
        await save(done);
      } catch (err) {
        if (isOfflineError(err)) break;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await save({ ...entry, error: err.status === 401 ? translate("adm.sync.errSession") : err.message });
          if (err.status === 401) break;
          const failed: OutboxEntry = { ...entry, status: "failed", error: err.message };
          byId.set(entry.id, failed);
          await save(failed);
          continue;
        }
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          const failed: OutboxEntry = { ...entry, status: "failed", error: err.message };
          byId.set(entry.id, failed);
          await save(failed);
          continue;
        }
        // Erreur serveur (5xx) : on réessaiera plus tard, sans abandonner tout de suite.
        const attempts = entry.attempts + 1;
        await save({
          ...entry,
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          error: translate("adm.sync.errServer"),
        });
        break;
      }
    }
  } finally {
    running = false;
    notify();
  }
}

export function isSyncing(): boolean {
  return running;
}

// --- Numéro de reçu provisoire -----------------------------------------------------------

function deviceId(): string {
  let id = localStorage.getItem("sa.deviceId");
  if (!id) {
    id = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    localStorage.setItem("sa.deviceId", id);
  }
  return id;
}

/**
 * PROV-{appareil}-{jjmmaa}-{n} : unique par appareil, jamais un numéro officiel (REC-xxxxxx, attribué
 * par le serveur à la synchronisation). Le compteur vit dans localStorage, jamais vidé à la déconnexion.
 */
export function nextProvisionalNumber(now = new Date()): string {
  const n = Number(localStorage.getItem("sa.provSeq") ?? "0") + 1;
  localStorage.setItem("sa.provSeq", String(n));
  const pad = (v: number) => String(v).padStart(2, "0");
  return `PROV-${deviceId()}-${pad(now.getDate())}${pad(now.getMonth() + 1)}${pad(now.getFullYear() % 100)}-${n}`;
}

// --- Suivi côté interface ----------------------------------------------------------------

export interface OutboxSummary {
  entries: OutboxEntry[];
  pending: number;
  failed: number;
}

export function useOutbox(): OutboxSummary {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void listOutbox().then((e) => alive && setEntries(e));
    load();
    window.addEventListener("sa-outbox", load);
    return () => {
      alive = false;
      window.removeEventListener("sa-outbox", load);
    };
  }, []);
  return {
    entries,
    pending: entries.filter((e) => e.status === "pending").length,
    failed: entries.filter((e) => e.status === "failed").length,
  };
}

/** Rappelle `callback` quand des saisies viennent d'être synchronisées (pour recharger une liste). */
export function useOnOutboxChange(callback: () => void): void {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });
  useEffect(() => {
    let last = "";
    const handler = () =>
      void listOutbox().then((entries) => {
        const signature = entries.map((e) => `${e.id}:${e.status}`).join(",");
        if (signature !== last) {
          const previous = last;
          last = signature;
          if (previous !== "") ref.current();
        }
      });
    handler();
    window.addEventListener("sa-outbox", handler);
    return () => window.removeEventListener("sa-outbox", handler);
  }, []);
}
