"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Trash2, X } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Badge, Button, Card, ErrorMessage, Field, Input, Select } from "@/components/ui";
import {
  BULLETIN_ACCEPT,
  MAX_BULLETIN_BYTES,
  MAX_CHILDREN,
  fileSizeLabel,
  isBulletinType,
  type SectionNode,
  type StudentKind,
  type SubmissionReceipt,
} from "@/lib/pre-registrations";
import { CopyrightFooter } from "@/components/copyright-footer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SchoolHeader } from "@/components/school-header";
import { useI18n } from "@/lib/i18n/use-i18n";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/store";
import { useSchoolBrand } from "@/lib/school-brand";

interface ChildForm {
  /** Identifiant local de la fiche (jamais envoyé) : garde chaque fiche stable quand on en retire une. */
  key: string;
  nom: string;
  prenom: string;
  sexe: "M" | "F" | "";
  dateNaissance: string;
  lieuNaissance: string;
  levelId: string;
  /** Vide tant que le parent n'a pas choisi : le choix est obligatoire pour chaque enfant. */
  typeEleve: StudentKind | "";
  ancienEtablissement: string;
  classePrecedenteLevelId: string;
  bulletin: File | null;
  bulletinError: string | null;
}

interface ParentForm {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

// La première fiche a une clé fixe (identique au rendu serveur et au rendu navigateur) ; les suivantes, ajoutées par un clic,
// reçoivent une clé unique. Un compteur global pour la première provoquerait un écart d'hydratation.
let keyCounter = 0;
const newChild = (key?: string): ChildForm => ({
  key: key ?? `enfant-${++keyCounter}`,
  nom: "",
  prenom: "",
  sexe: "",
  dateNaissance: "",
  lieuNaissance: "",
  levelId: "",
  typeEleve: "",
  ancienEtablissement: "",
  classePrecedenteLevelId: "",
  bulletin: null,
  bulletinError: null,
});

const EMPTY_PARENT: ParentForm = { nom: "", prenom: "", telephone: "", email: "" };

async function extractError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? translate("common.error"));
  } catch {
    return translate("common.error");
  }
}

/** Liste des niveaux par section et cycle, pour « Classe demandée » et « Classe fréquentée l'année précédente ». */
function LevelSelect({
  tree,
  value,
  onChange,
  required = true,
}: {
  tree: SectionNode[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Select required={required} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("cnt.pre.choose")}</option>
      {tree.map((section) => (
        <optgroup key={section.sectionId} label={section.sectionNom}>
          {section.cycles.flatMap((cycle) =>
            cycle.levels.map((level) => (
              <option key={level.id} value={level.id}>
                {cycle.cycleNom} · {level.nom}
              </option>
            )),
          )}
        </optgroup>
      ))}
    </Select>
  );
}

/** Une fiche enfant : ses informations, sa classe demandée, son statut et ses documents propres. */
function ChildCard({
  index,
  child,
  tree,
  school,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  child: ChildForm;
  tree: SectionNode[];
  school: string;
  canRemove: boolean;
  onChange: (patch: Partial<ChildForm>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [fileInputKey, setFileInputKey] = useState(0);

  function pickFile(file: File | null) {
    if (!file) return;
    if (!isBulletinType(file)) return onChange({ bulletin: null, bulletinError: t("cnt.pre.fileType") });
    if (file.size > MAX_BULLETIN_BYTES) return onChange({ bulletin: null, bulletinError: t("cnt.pre.fileTooBig") });
    onChange({ bulletin: file, bulletinError: null });
  }

  return (
    <Card>
      <fieldset className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <legend className="font-display text-base font-semibold text-ink">{t("cnt.pre.childN", { n: index + 1 })}</legend>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("cnt.pre.removeChildAria", { n: index + 1 })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-danger hover:bg-danger-soft"
            >
              <Trash2 size={13} /> {t("cnt.pre.removeChild")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("cnt.pre.lastName")}>
            <Input required value={child.nom} onChange={(e) => onChange({ nom: e.target.value })} />
          </Field>
          <Field label={t("cnt.pre.firstName")}>
            <Input required value={child.prenom} onChange={(e) => onChange({ prenom: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("cnt.pre.sex")}>
            <Select required value={child.sexe} onChange={(e) => onChange({ sexe: e.target.value as "M" | "F" | "" })}>
              <option value="">{t("cnt.pre.choose")}</option>
              <option value="F">{t("cnt.pre.female")}</option>
              <option value="M">{t("cnt.pre.male")}</option>
            </Select>
          </Field>
          <Field label={t("cnt.pre.birthDate")}>
            <Input type="date" required max={new Date().toISOString().slice(0, 10)} value={child.dateNaissance} onChange={(e) => onChange({ dateNaissance: e.target.value })} />
          </Field>
        </div>
        <Field label={t("cnt.pre.birthPlace")}>
          <Input value={child.lieuNaissance} onChange={(e) => onChange({ lieuNaissance: e.target.value })} />
        </Field>
        <Field label={t("cnt.pre.level")}>
          <LevelSelect tree={tree} value={child.levelId} onChange={(levelId) => onChange({ levelId })} />
        </Field>

        {/* Choix obligatoire pour chaque enfant : nouvel élève ou ancien élève de l'école. */}
        <div role="radiogroup" aria-label={t("cnt.pre.studentStatus")} className="space-y-2">
          <p className="text-sm font-medium text-ink">{t("cnt.pre.studentStatus")}</p>
          {(["NOUVEAU", "ANCIEN"] as const).map((kind) => (
            <label
              key={kind}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
                child.typeEleve === kind ? "border-primary bg-primary-soft text-ink" : "border-border text-ink"
              }`}
            >
              <input
                type="radio"
                name={`${child.key}-statut`}
                value={kind}
                required
                checked={child.typeEleve === kind}
                onChange={() => onChange({ typeEleve: kind })}
              />
              {kind === "NOUVEAU" ? t("cnt.pre.kindNew") : t("cnt.pre.kindOld", { school })}
            </label>
          ))}
        </div>

        {child.typeEleve === "ANCIEN" && (
          <div className="space-y-1.5 rounded-xl bg-surface-muted p-3">
            <Field label={t("cnt.pre.previousClass")}>
              <LevelSelect tree={tree} value={child.classePrecedenteLevelId} onChange={(classePrecedenteLevelId) => onChange({ classePrecedenteLevelId })} />
            </Field>
            <p className="text-xs text-ink-muted">{t("cnt.pre.previousClassHint")}</p>
          </div>
        )}

        {child.typeEleve === "NOUVEAU" && (
          <div className="space-y-3 rounded-xl bg-surface-muted p-3">
            <Field label={t("cnt.pre.previousSchool")}>
              <Input maxLength={120} value={child.ancienEtablissement} onChange={(e) => onChange({ ancienEtablissement: e.target.value })} />
            </Field>
            <div>
              <Field label={t("cnt.pre.lastReport")}>
                <input
                  key={fileInputKey}
                  type="file"
                  accept={BULLETIN_ACCEPT}
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3.5 file:py-1.5 file:text-sm file:font-medium file:text-white"
                />
              </Field>
              <p className="mt-1 text-xs text-ink-muted">{t("cnt.pre.lastReportHint")}</p>
              {child.bulletinError && <p className="mt-1 text-xs text-danger">{child.bulletinError}</p>}
              {child.bulletin && (
                <p className="mt-2 flex items-center gap-2 text-sm text-ink">
                  <FileText size={15} className="shrink-0 text-ink-muted" />
                  <span className="min-w-0 truncate">{child.bulletin.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{fileSizeLabel(child.bulletin.size)}</span>
                  <button
                    type="button"
                    aria-label={t("cnt.pre.removeFile")}
                    title={t("cnt.pre.removeFile")}
                    className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-surface hover:text-danger"
                    onClick={() => {
                      onChange({ bulletin: null, bulletinError: null });
                      setFileInputKey((k) => k + 1);
                    }}
                  >
                    <X size={14} />
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
      </fieldset>
    </Card>
  );
}

/**
 * Dépôt public d'une demande de préinscription : aucun compte requis. Le parent ou tuteur est saisi une seule fois ;
 * chaque enfant a sa propre fiche (classe demandée, nouvel ou ancien élève, documents). La classe réelle et l'année
 * scolaire sont choisies par le secrétariat à l'examen de la demande, jamais ici. Aucun frais n'est demandé à ce stade.
 */
export default function PreRegistrationPage() {
  const { t } = useI18n();
  const { brand } = useSchoolBrand({ withLogo: false });
  const school = brand?.nom ?? "Shakespeare Academy";
  const [tree, setTree] = useState<SectionNode[]>([]);
  const [parent, setParent] = useState<ParentForm>(EMPTY_PARENT);
  const [children, setChildren] = useState<ChildForm[]>(() => [newChild("enfant-0")]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/preinscriptions/niveaux`)
      .then((res) => (res.ok ? (res.json() as Promise<SectionNode[]>) : Promise.reject()))
      .then(setTree)
      .catch(() => setTree([]));
  }, []);

  const levelName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of tree) for (const c of s.cycles) for (const l of c.levels) map.set(l.id, l.nom);
    return map;
  }, [tree]);

  const update = (key: string, patch: Partial<ChildForm>) => setChildren((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (children.some((c) => !c.typeEleve)) return setError(t("cnt.pre.needChoice"));
    setBusy(true);
    try {
      const payload = {
        responsable: {
          nom: parent.nom,
          prenom: parent.prenom,
          telephone: parent.telephone,
          email: parent.email.trim() || undefined,
        },
        message: message.trim() || undefined,
        enfants: children.map((c) => ({
          nom: c.nom,
          prenom: c.prenom,
          sexe: c.sexe,
          dateNaissance: c.dateNaissance,
          lieuNaissance: c.lieuNaissance.trim() || undefined,
          levelId: c.levelId,
          typeEleve: c.typeEleve,
          ancienEtablissement: c.typeEleve === "NOUVEAU" ? c.ancienEtablissement.trim() || undefined : undefined,
          classePrecedenteLevelId: c.typeEleve === "ANCIEN" ? c.classePrecedenteLevelId : undefined,
        })),
      };
      // Multipart : le JSON dans « payload », un fichier « bulletin_<rang> » pour chaque enfant qui joint son bulletin.
      const body = new FormData();
      body.append("payload", JSON.stringify(payload));
      children.forEach((c, i) => {
        if (c.typeEleve === "NOUVEAU" && c.bulletin) body.append(`bulletin_${i}`, c.bulletin, c.bulletin.name);
      });
      // Les messages du serveur (doublon, fichier refusé…) suivent la langue choisie sur le site, pas celle du navigateur.
      const res = await fetch(`${API_URL}/preinscriptions`, { method: "POST", body, headers: { "Accept-Language": getLocale() } });
      if (!res.ok) throw new Error(await extractError(res));
      setReceipt((await res.json()) as SubmissionReceipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher />
        </div>
        <SchoolHeader title={t("cnt.pre.title")} />
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)]">
          <div className="text-center">
            <p className="font-display text-lg font-semibold text-ink">{t("cnt.pre.sentTitle")}</p>
            <p className="mt-2 text-sm text-ink-muted">{t("cnt.pre.sentNote")}</p>
            <p className="mt-3 rounded-xl bg-primary-soft px-4 py-3 font-mono text-xl font-semibold tracking-wide text-primary">{receipt.reference}</p>
          </div>

          {/* Récapitulatif : tous les enfants de la demande, tels que l'école les a enregistrés. */}
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("cnt.pre.sentChildren")}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {t("cnt.pre.recapParent", { name: `${receipt.responsable.prenom} ${receipt.responsable.nom}`, phone: parent.telephone })}
            </p>
            <ul className="mt-3 space-y-2">
              {receipt.enfants.map((c, i) => (
                <li key={`${c.prenom}-${c.nom}-${i}`} className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-medium text-ink">
                    {c.prenom} {c.nom}
                  </p>
                  <p className="text-ink-muted">{t("cnt.pre.trackRequested", { level: c.classeDemandee })}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge color={c.typeEleve === "ANCIEN" ? "blue" : "green"}>{c.typeEleve === "ANCIEN" ? t("cnt.pre.kindOld", { school }) : t("cnt.pre.kindNew")}</Badge>
                    {c.classePrecedente && <span className="text-xs text-ink-muted">{t("cnt.pre.sentPrevClass", { level: c.classePrecedente })}</span>}
                    {c.ancienEtablissement && <span className="text-xs text-ink-muted">{t("cnt.pre.sentPrevSchool", { school: c.ancienEtablissement })}</span>}
                    {c.bulletinJoint && <Badge color="gray">{t("cnt.pre.recapReport")}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-center text-sm text-ink-muted">{t("cnt.pre.sentInfo")}</p>
          <div className="text-center">
            <Link href="/preinscription/suivi" className="mt-4 inline-block font-medium text-primary underline">
              {t("cnt.pre.track")}
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <CopyrightFooter />
        </div>
      </div>
    );
  }

  const parentName = `${parent.prenom} ${parent.nom}`.trim();

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-3 flex justify-end">
        <LanguageSwitcher />
      </div>
      <SchoolHeader title={t("cnt.pre.title")} subtitle={t("cnt.pre.subtitle")} />
      <form onSubmit={submit} className="space-y-4">
        {/* Parent ou tuteur : saisi une seule fois, quel que soit le nombre d'enfants. */}
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t("cnt.pre.guardian")}</h2>
              <p className="text-xs text-ink-muted">{t("cnt.pre.guardianHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("cnt.pre.lastName")}>
                <Input required value={parent.nom} onChange={(e) => setParent({ ...parent, nom: e.target.value })} />
              </Field>
              <Field label={t("cnt.pre.firstName")}>
                <Input required value={parent.prenom} onChange={(e) => setParent({ ...parent, prenom: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("cnt.pre.phone")}>
                <Input type="tel" required value={parent.telephone} onChange={(e) => setParent({ ...parent, telephone: e.target.value })} />
              </Field>
              <Field label={t("cnt.pre.email")}>
                <Input type="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        {children.map((child, index) => (
          <ChildCard
            key={child.key}
            index={index}
            child={child}
            tree={tree}
            school={school}
            canRemove={children.length > 1}
            onChange={(patch) => update(child.key, patch)}
            onRemove={() => setChildren((list) => list.filter((c) => c.key !== child.key))}
          />
        ))}
        {tree.length === 0 && <p className="text-xs text-ink-muted">{t("cnt.pre.noLevels")}</p>}

        <div>
          <Button type="button" variant="secondary" className="w-full" disabled={children.length >= MAX_CHILDREN} onClick={() => setChildren((list) => [...list, newChild()])}>
            <Plus size={16} /> {t("cnt.pre.addChild")}
          </Button>
          {children.length >= MAX_CHILDREN && <p className="mt-1.5 text-center text-xs text-ink-muted">{t("cnt.pre.maxChildren", { max: MAX_CHILDREN })}</p>}
        </div>

        <Card>
          <Field label={t("cnt.pre.message")}>
            <textarea
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
        </Card>

        {/* Récapitulatif avant l'envoi : tous les enfants de la demande, un par ligne. */}
        <Card>
          <h2 className="font-display text-base font-semibold text-ink">{t("cnt.pre.recapTitle")}</h2>
          <p className="mt-1 text-sm text-ink-muted">{children.length === 1 ? t("cnt.pre.recapOne") : t("cnt.pre.recapMany", { n: children.length })}</p>
          <p className="mt-1 text-sm text-ink-muted">{t("cnt.pre.recapParent", { name: parentName || `(${t("cnt.pre.recapPending")})`, phone: parent.telephone || "…" })}</p>
          <ul className="mt-3 space-y-2" aria-live="polite">
            {children.map((c, i) => {
              const name = `${c.prenom} ${c.nom}`.trim();
              return (
                <li key={c.key} className="rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{name || `${t("cnt.pre.childN", { n: i + 1 })} (${t("cnt.pre.recapPending")})`}</span>
                  <span className="text-ink-muted">
                    {" — "}
                    {c.levelId ? t("cnt.pre.recapClass", { level: levelName.get(c.levelId) ?? "" }) : t("cnt.pre.recapClassMissing")}
                    {" — "}
                    {c.typeEleve === "" ? t("cnt.pre.recapKindMissing") : c.typeEleve === "NOUVEAU" ? t("cnt.pre.kindNew") : t("cnt.pre.kindOld", { school })}
                    {c.typeEleve === "NOUVEAU" && c.bulletin ? ` — ${t("cnt.pre.recapReport")}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("cnt.pre.sending") : t("cnt.pre.submit")}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-muted">
        {t("cnt.pre.already")}{" "}
        <Link href="/preinscription/suivi" className="font-medium text-primary underline">
          {t("cnt.pre.followStatus")}
        </Link>
      </p>
      <div className="mt-6">
        <CopyrightFooter />
      </div>
    </div>
  );
}
