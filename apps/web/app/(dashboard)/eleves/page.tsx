"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useOnOutboxChange, useOutbox } from "@/lib/outbox";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Student, StudentByClassRow } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, PageTitle, Spinner } from "@/components/ui";
import { GraduationCap, Minus, Plus, Search } from "lucide-react";
import { buildSection } from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";
import { ClassCardsPanel } from "@/components/documents/class-cards-panel";

function initials(nom: string, prenom: string) {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

/** Bouton + / - qui développe la ligne d'un élève. */
function ExpandButton({ open, onClick, label }: { open: boolean; onClick: (e: React.MouseEvent) => void; label: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={t(open ? "stu.list.collapseRow" : "stu.list.expandRow", { label })}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-surface-muted"
    >
      {open ? <Minus size={15} /> : <Plus size={15} />}
    </button>
  );
}

/** Détail d'un élève : classe et responsable viennent de l'état des effectifs, le reste de la fiche. */
function StudentDetails({ student, info }: { student: Student; info?: StudentByClassRow }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <Detail
        label={t("stu.list.dClass")}
        value={info?.classe ? `${info.classe}${info.section ? ` (${info.section})` : ""}` : t("stu.list.dNoClass")}
      />
      <Detail label={t("stu.list.dCycle")} value={info?.cycle || "-"} />
      <Detail label={t("stu.list.dYear")} value={info?.annee || "-"} />
      <Detail label={t("stu.list.dSex")} value={student.sexe === "M" ? t("stu.sexM") : t("stu.sexF")} />
      <Detail label={t("stu.list.dBirth")} value={formatDate(student.dateNaissance)} />
      <Detail label={t("stu.list.dNationality")} value={student.nationalite ?? "-"} />
      <Detail label={t("stu.list.dGuardian")} value={info?.responsable || t("stu.list.dGuardianTodo")} />
      <Detail label={t("stu.list.dPhone")} value={info?.telephoneResponsable || "-"} />
      <div className="flex items-end">
        <Link href={`/eleves/${student.id}`} className="font-medium text-primary hover:underline">
          {t("stu.list.openFile")}
        </Link>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </p>
  );
}

export default function StudentsListPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { t } = useI18n();
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [infoById, setInfoById] = useState<Map<string, StudentByClassRow>>(new Map());
  const { entries } = useOutbox();

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Classe et responsable des élèves : facultatif, un échec n'empêche jamais d'afficher la liste.
  useEffect(() => {
    void api
      .get<StudentByClassRow[]>("/reports/students-by-class")
      .then((data) => setInfoById(new Map(data.map((r) => [r.id, r]))))
      .catch(() => {});
  }, []);

  // Élèves créés sur cet appareil sans Internet et pas encore enregistrés par le serveur.
  const pendingStudents = entries.filter((e) => e.kind === "student" && (e.status === "pending" || e.status === "failed"));

  useEffect(() => {
    void api
      .get<Student[]>("/students")
      .then((data) => setStudents(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useOnOutboxChange(() => {
    if (!query.trim()) void api.get<Student[]>("/students").then(setStudents).catch(() => {});
  });

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query.trim()) {
        void api.get<Student[]>("/students").then(setStudents).catch(() => {});
        return;
      }
      setSearching(true);
      void api
        .get<Student[]>(`/students/search?q=${encodeURIComponent(query)}`)
        .then(setStudents)
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageTitle eyebrow={t("stu.list.eyebrow")} subtitle={t("stu.list.subtitle")} helpId="eleves">
          {t("stu.list.title")}
        </PageTitle>
        <div className="flex flex-wrap gap-2">
          <ExportButtons
            fileName={t("stu.list.exportFile")}
            title={t("stu.list.exportTitle")}
            disabled={!loaded}
            sections={[
              buildSection(
                t("stu.list.exportSheet"),
                [
                  { header: t("stu.list.colStudentNumber"), value: (r: Student) => r.matricule },
                  { header: t("stu.list.colSurname"), value: (r: Student) => r.nom },
                  { header: t("stu.list.colFirstName"), value: (r: Student) => r.prenom },
                  { header: t("stu.list.colSex"), value: (r: Student) => (r.sexe === "M" ? t("stu.sexM") : t("stu.sexF")) },
                  { header: t("stu.list.colBirthDate"), value: (r: Student) => formatDate(r.dateNaissance) },
                  {
                    header: t("stu.list.colStatus"),
                    value: (r: Student) => (r.statut === "ACTIF" ? t("stu.statusActive") : t("stu.statusInactive")),
                  },
                ],
                students,
              ),
            ]}
          />
          {hasPermission("ENROLLMENT_MANAGE") && (
            <Link href="/eleves/inscription">
              <Button>{t("stu.list.newEnrolment")}</Button>
            </Link>
          )}
        </div>
      </div>

      {hasPermission("DOCUMENT_ISSUE") && <ClassCardsPanel />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            placeholder={t("stu.list.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
          {searching && <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />}
        </div>
        {students.length > 0 && (
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setOpen(new Set(students.map((st) => st.id)))}
              className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
            >
              {t("stu.expandAll")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(new Set())}
              className="rounded-full border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-surface-muted"
            >
              {t("stu.collapseAll")}
            </button>
          </div>
        )}
      </div>

      {pendingStudents.length > 0 && !query.trim() && (
        <Card className="mb-4 border-l-4 border-l-warning">
          <p className="mb-2 text-sm font-semibold text-ink">
            {t("stu.list.pendingTitle", { count: pendingStudents.length })}
          </p>
          <ul className="divide-y divide-border text-sm">
            {pendingStudents.map((e) => {
              const b = e.body as { nom?: string; prenom?: string };
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-ink">
                    {b.prenom} {b.nom}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge color={e.status === "failed" ? "red" : "orange"}>
                      {e.status === "failed" ? t("stu.list.refused") : t("stu.list.createdOffline")}
                    </Badge>
                    <Link href="/hors-ligne" className="text-xs text-primary hover:underline">
                      {t("stu.list.detail")}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">{t("stu.list.numberAssignedOnSend")}</p>
        </Card>
      )}

      {loaded && students.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={query ? t("stu.list.emptySearch") : t("stu.list.emptyNone")}
          description={!query ? t("stu.list.emptyHint") : undefined}
          action={
            !query && hasPermission("ENROLLMENT_MANAGE") ? (
              <Link href="/eleves/inscription">
                <Button variant="secondary">{t("stu.list.newEnrolmentShort")}</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop / tablette : tableau. */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="w-10 py-2 pr-2" aria-label={t("stu.list.detailsAria")}></th>
                    <th className="py-2 pr-4">{t("stu.list.colStudent")}</th>
                    <th className="py-2 pr-4">{t("stu.list.colStudentNumber")}</th>
                    <th className="py-2 pr-4">{t("stu.list.colBirthDate")}</th>
                    <th className="py-2 pr-4">{t("stu.list.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <Fragment key={s.id}>
                    <tr
                      onClick={() => router.push(`/eleves/${s.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted"
                    >
                      <td className="py-2.5 pr-2">
                        <ExpandButton
                          open={open.has(s.id)}
                          label={`${s.prenom} ${s.nom}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(s.id);
                          }}
                        />
                      </td>
                      <td className="py-2.5 pr-4">
                        <Link href={`/eleves/${s.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {initials(s.nom, s.prenom)}
                          </span>
                          <span className="font-medium text-ink hover:underline">
                            {s.prenom} {s.nom}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-ink-muted">{s.matricule}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">
                        {formatDate(s.dateNaissance)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge color={s.statut === "ACTIF" ? "green" : "gray"}>
                          {s.statut === "ACTIF" ? t("stu.statusActive") : t("stu.statusInactive")}
                        </Badge>
                      </td>
                    </tr>
                    {open.has(s.id) && (
                      <tr className="border-b border-border bg-surface-muted/50">
                        <td></td>
                        <td colSpan={4} className="py-3 pr-4">
                          <StudentDetails student={s} info={infoById.get(s.id)} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile : cartes. */}
          <div className="space-y-2 sm:hidden">
            {students.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-3 p-3.5">
                  <ExpandButton open={open.has(s.id)} label={`${s.prenom} ${s.nom}`} onClick={() => toggle(s.id)} />
                  <Link href={`/eleves/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                      {initials(s.nom, s.prenom)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {s.prenom} {s.nom}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {s.matricule} · {formatDate(s.dateNaissance)}
                      </p>
                    </div>
                    <Badge color={s.statut === "ACTIF" ? "green" : "gray"}>
                      {s.statut === "ACTIF" ? t("stu.statusActive") : t("stu.statusInactive")}
                    </Badge>
                  </Link>
                </div>
                {open.has(s.id) && (
                  <div className="border-t border-border bg-surface-muted/50 p-3.5">
                    <StudentDetails student={s} info={infoById.get(s.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!loaded && (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner /> {t("stu.list.loading")}
        </div>
      )}
    </div>
  );
}
