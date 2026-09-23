"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  CalendarCheck2,
  PlusCircle,
  Search,
  Wallet,
  Receipt,
  PiggyBank,
  TrendingUp,
  AlertOctagon,
  Percent,
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  Smartphone,
  Banknote,
  Hourglass,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatMontant } from "@/lib/format";
import { buildSection, type ExportSection } from "@/lib/export";
import type { AcademicYear, DashboardStats, Student } from "@/lib/types";
import { Badge, Button, Card, PageTitle, StatCard, type StatTone } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { ExpandAll, ExpandButton, useExpanded } from "@/components/expand";

function recoveryTone(rate: number | null): StatTone {
  if (rate === null) return "info";
  if (rate >= 75) return "success";
  if (rate >= 40) return "warning";
  return "danger";
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export default function DashboardHomePage() {
  const { user, hasPermission } = useAuth();
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const expand = useExpanded();

  useEffect(() => {
    void (async () => {
      const years = await api.get<AcademicYear[]>("/academic-years");
      setActiveYear(years.find((y) => y.statut === "ACTIVE") ?? null);
      // Un enseignant n'a pas accès aux dossiers d'élèves : on ne les demande pas (le serveur refuserait).
      if (hasPermission("STUDENT_READ")) {
        const students = await api.get<Student[]>("/students");
        setStudentCount(students.length);
      }
    })();
    // Le tableau de bord mêle effectifs et finances : il n'est demandé qu'aux comptes qui peuvent lire les finances.
    if (hasPermission("FINANCE_READ")) {
      void api
        .get<DashboardStats>("/reports/dashboard")
        .then(setStats)
        .catch(() => setStats(null));
    }
  }, [hasPermission]);

  const exportSections = useMemo<ExportSection[]>(() => {
    if (!stats) return [];
    const indicators: Array<[string, string]> = [
      ["Année scolaire active", stats.anneeActive ?? "Aucune"],
      ["Élèves actifs", String(stats.effectifs.actifs)],
      ["Garçons", String(stats.effectifs.parSexe.M)],
      ["Filles", String(stats.effectifs.parSexe.F)],
      ["Nouvelles inscriptions", String(stats.inscriptions.nouvelles)],
      ["Réinscriptions", String(stats.inscriptions.reinscriptions)],
      ["Total facturé", formatMontant(stats.financier.totalFacture)],
      ["Total remises", formatMontant(stats.financier.totalRemises)],
      ["Total encaissé", formatMontant(stats.financier.totalEncaisse)],
      ["Restant dû", formatMontant(stats.financier.totalRestantDu)],
      ["Taux de recouvrement", stats.financier.tauxRecouvrement !== null ? `${stats.financier.tauxRecouvrement} %` : "-"],
      ["Solde de caisse cumulé", formatMontant(stats.financier.soldeCaisseCumule)],
      ["Paiements en espèces", formatMontant(stats.paiements.parMode.ESPECES)],
      ["Paiements Mobile Money", formatMontant(stats.paiements.parMode.MOBILE_MONEY)],
      ["Remises en attente", String(stats.remises.enAttente)],
      ["Dépenses en attente", String(stats.depenses.enAttenteCount)],
      ["Sorties approuvées (total)", formatMontant(stats.depenses.totalApprouve)],
      ["Élèves insolvables", String(stats.insolvables.count)],
    ];
    return [
      buildSection<[string, string]>(
        "Indicateurs",
        [
          { header: "Indicateur", value: (r) => r[0] },
          { header: "Valeur", value: (r) => r[1] },
        ],
        indicators,
      ),
      buildSection(
        "Effectif par classe",
        [
          { header: "Classe", value: (c) => c.nom },
          { header: "Cycle", value: (c) => c.cycle },
          { header: "Section", value: (c) => c.section },
          { header: "Effectif", value: (c) => c.effectif, kind: "number" },
        ],
        stats.repartition.parClasse,
        ["Total", "", "", stats.repartition.parClasse.reduce((n, c) => n + c.effectif, 0)],
      ),
    ];
  }, [stats]);

  const totalNet = stats ? stats.financier.totalFacture - stats.financier.totalRemises : 0;
  const maxClass = stats ? Math.max(1, ...stats.repartition.parClasse.map((c) => c.effectif)) : 1;
  const totalSection = stats ? stats.repartition.parSection.reduce((n, s) => n + s.effectif, 0) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle eyebrow="Tableau de bord" subtitle={`Bienvenue, ${user?.prenom} ${user?.nom}.`} helpId="tableau-de-bord">
          Bonjour {user?.prenom}
        </PageTitle>
        {stats && (
          <ExportButtons fileName="tableau-de-bord" title="Tableau de bord" sections={exportSections} />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Année scolaire active"
          value={activeYear ? activeYear.libelle : "Aucune"}
          tone={activeYear ? "primary" : "warning"}
          icon={<CalendarCheck2 size={18} />}
          hint={!activeYear ? "Aucune inscription possible tant qu'aucune année n'est active." : undefined}
        />
        <StatCard label="Élèves enregistrés" value={studentCount ?? "…"} tone="accent" icon={<GraduationCap size={18} />} />
      </div>

      {!activeYear && (
        <Card className="mt-4 border-warning/30 bg-warning-soft/40">
          <p className="text-sm text-warning">
            <strong>Aucune année scolaire active.</strong> Rendez-vous dans « Années scolaires » pour en activer une
            avant de commencer les inscriptions.
          </p>
        </Card>
      )}

      {stats && (
        <>
          <div className="mt-6">
            <ExpandAll
              count={3}
              onOpenAll={() => expand.openAll(["effectifs", "finances", "attente"])}
              onCloseAll={expand.closeAll}
            />
          </div>
          <SectionTitle
            icon={<Users size={14} />}
            tone="info"
            open={expand.isOpen("effectifs")}
            onToggle={() => expand.toggle("effectifs")}
            summary={`${stats.effectifs.actifs} élève(s) actif(s) · ${stats.effectifs.parSexe.M} G · ${stats.effectifs.parSexe.F} F`}
          >
            Effectifs
          </SectionTitle>
          {expand.isOpen("effectifs") && (
            <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Élèves actifs"
              value={stats.effectifs.actifs}
              tone="primary"
              icon={<GraduationCap size={18} />}
              hint={stats.effectifs.inactifs > 0 ? `${stats.effectifs.inactifs} inactif(s)` : undefined}
            />
            <StatCard
              label="Garçons"
              value={stats.effectifs.parSexe.M}
              tone="info"
              icon={<Users size={18} />}
              progress={pct(stats.effectifs.parSexe.M, stats.effectifs.actifs)}
              hint={`${Math.round(pct(stats.effectifs.parSexe.M, stats.effectifs.actifs))} % des élèves`}
            />
            <StatCard
              label="Filles"
              value={stats.effectifs.parSexe.F}
              tone="accent"
              icon={<Users size={18} />}
              progress={pct(stats.effectifs.parSexe.F, stats.effectifs.actifs)}
              hint={`${Math.round(pct(stats.effectifs.parSexe.F, stats.effectifs.actifs))} % des élèves`}
            />
            <StatCard
              label="Inscriptions cette année"
              value={stats.inscriptions.nouvelles + stats.inscriptions.reinscriptions}
              tone="success"
              icon={<CalendarCheck2 size={18} />}
              hint={`${stats.inscriptions.nouvelles} nouvelle(s) · ${stats.inscriptions.reinscriptions} réinscription(s)${
                stats.inscriptions.annulees > 0 ? ` · ${stats.inscriptions.annulees} annulée(s)` : ""
              }`}
            />
          </div>

          {stats.repartition.parSection.length > 0 && (
            <Card className="mt-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Répartition par section</h2>
              <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-surface-muted">
                {stats.repartition.parSection.map((s) => (
                  <div
                    key={s.nom}
                    className={sectionBar(s.nom)}
                    style={{ width: `${pct(s.effectif, totalSection)}%` }}
                    title={`${s.nom} : ${s.effectif}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.repartition.parSection.map((s) => (
                  <Badge key={s.nom} color={s.nom.toLowerCase().startsWith("angl") ? "blue" : "primary"}>
                    {s.nom} : {s.effectif} élève(s) ({Math.round(pct(s.effectif, totalSection))} %)
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {stats.repartition.parClasse.length > 0 && (
            <Card className="mt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">Effectif par classe</h2>
                <Link href="/eleves-par-classe" className="text-xs font-medium text-primary hover:underline">
                  Voir la liste des élèves par classe →
                </Link>
              </div>
              <ul className="space-y-2">
                {stats.repartition.parClasse.map((c) => (
                  <li key={`${c.section}-${c.nom}`} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium text-ink" title={`${c.nom} (${c.section})`}>
                      {c.nom}
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-muted">
                      <div className={`h-full rounded-full ${sectionBar(c.section)}`} style={{ width: `${(c.effectif / maxClass) * 100}%` }} />
                    </div>
                    <span className="text-right font-semibold text-ink">{c.effectif}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
                <Legend color="bg-info" label="Anglophone" />
                <Legend color="bg-primary" label="Francophone" />
              </p>
            </Card>
          )}
            </>
          )}

          <SectionTitle
            icon={<Wallet size={14} />}
            tone="success"
            open={expand.isOpen("finances")}
            onToggle={() => expand.toggle("finances")}
            summary={`Encaissé ${formatMontant(stats.financier.totalEncaisse)} · Restant dû ${formatMontant(stats.financier.totalRestantDu)}`}
          >
            Finances (année active)
          </SectionTitle>
          {expand.isOpen("finances") && (
            <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total facturé" value={formatMontant(stats.financier.totalFacture)} tone="info" icon={<Receipt size={18} />} />
            <StatCard
              label="Total encaissé"
              value={formatMontant(stats.financier.totalEncaisse)}
              tone="success"
              icon={<ArrowDownCircle size={18} />}
              hint="Argent réellement reçu"
            />
            <StatCard label="Total remises" value={formatMontant(stats.financier.totalRemises)} tone="warning" icon={<Percent size={18} />} hint="Réductions approuvées" />
            <StatCard
              label="Restant dû"
              value={formatMontant(stats.financier.totalRestantDu)}
              tone={stats.financier.totalRestantDu > 0 ? "danger" : "success"}
              icon={<TrendingUp size={18} />}
              hint={stats.financier.totalRestantDu > 0 ? "À encaisser" : "Tout est réglé"}
            />
            <StatCard
              label="Taux de recouvrement"
              value={stats.financier.tauxRecouvrement !== null ? `${stats.financier.tauxRecouvrement} %` : "-"}
              tone={recoveryTone(stats.financier.tauxRecouvrement)}
              icon={<Percent size={18} />}
              progress={stats.financier.tauxRecouvrement}
              hint={stats.financier.tauxRecouvrement === null ? "Aucune facture émise" : "De ce qui est dû après remises"}
            />
            <StatCard
              label="Solde de caisse cumulé"
              value={formatMontant(stats.financier.soldeCaisseCumule)}
              tone={stats.financier.soldeCaisseCumule >= 0 ? "success" : "danger"}
              icon={<PiggyBank size={18} />}
              hint="Entrées moins sorties"
            />
            <StatCard label="Paiements en espèces" value={formatMontant(stats.paiements.parMode.ESPECES)} tone="success" icon={<Banknote size={18} />} />
            <StatCard label="Paiements Mobile Money" value={formatMontant(stats.paiements.parMode.MOBILE_MONEY)} tone="info" icon={<Smartphone size={18} />} />
          </div>

          {totalNet > 0 && (
            <Card className="mt-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Où en est la facturation ?</h2>
              <div className="flex h-5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label="Encaissé, remises et restant dû">
                <div className="bg-success" style={{ width: `${pct(stats.financier.totalEncaisse, stats.financier.totalFacture)}%` }} title="Encaissé" />
                <div className="bg-warning" style={{ width: `${pct(stats.financier.totalRemises, stats.financier.totalFacture)}%` }} title="Remises" />
                <div className="bg-danger" style={{ width: `${pct(Math.max(0, stats.financier.totalRestantDu), stats.financier.totalFacture)}%` }} title="Restant dû" />
              </div>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                <Legend color="bg-success" label={`Encaissé ${formatMontant(stats.financier.totalEncaisse)}`} />
                <Legend color="bg-warning" label={`Remises ${formatMontant(stats.financier.totalRemises)}`} />
                <Legend color="bg-danger" label={`Restant dû ${formatMontant(Math.max(0, stats.financier.totalRestantDu))}`} />
              </p>
            </Card>
          )}
            </>
          )}

          <SectionTitle
            icon={<ArrowUpCircle size={14} />}
            tone="warning"
            open={expand.isOpen("attente")}
            onToggle={() => expand.toggle("attente")}
            summary={`${stats.remises.enAttente} remise(s) · ${stats.depenses.enAttenteCount} dépense(s) · ${stats.insolvables.count} insolvable(s)`}
          >
            Opérations en attente
          </SectionTitle>
          {expand.isOpen("attente") && (
            <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Remises en attente"
              value={stats.remises.enAttente}
              tone={stats.remises.enAttente > 0 ? "warning" : "success"}
              icon={<Hourglass size={18} />}
              hint={`${stats.remises.approuvees} approuvée(s) · ${stats.remises.rejetees} rejetée(s)`}
            />
            <StatCard
              label="Dépenses en attente"
              value={stats.depenses.enAttenteCount}
              tone={stats.depenses.enAttenteCount > 0 ? "warning" : "success"}
              icon={<Hourglass size={18} />}
              hint={stats.depenses.enAttenteCount > 0 ? formatMontant(stats.depenses.enAttenteMontant) : "Rien à valider"}
            />
            <StatCard
              label="Sorties approuvées (total)"
              value={formatMontant(stats.depenses.totalApprouve)}
              tone={stats.depenses.totalApprouve > 0 ? "danger" : "info"}
              icon={<ArrowUpCircle size={18} />}
              hint="Argent sorti de la caisse"
            />
            <Link href="/insolvables" className="block">
              <StatCard
                label="Élèves insolvables"
                value={stats.insolvables.count}
                tone={stats.insolvables.count > 0 ? "danger" : "success"}
                icon={<AlertOctagon size={18} />}
                hint={stats.insolvables.count > 0 ? "Voir le détail" : "Aucun retard de paiement"}
              />
            </Link>
          </div>
            </>
          )}
        </>
      )}

      {hasPermission("ENROLLMENT_MANAGE") && (
        <Card className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Actions rapides
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/eleves/inscription">
              <Button>
                <PlusCircle size={16} /> Nouvelle inscription / réinscription
              </Button>
            </Link>
            <Link href="/eleves">
              <Button variant="secondary">
                <Search size={16} /> Rechercher un élève
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Badge color="primary">{user?.roleCode}</Badge>
        <span>connecté(e) en tant que {user?.email}</span>
      </div>
    </div>
  );
}

function sectionBar(section: string): string {
  return section.toLowerCase().startsWith("angl") ? "bg-info" : "bg-primary";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
    </span>
  );
}

const SECTION_TONE: Record<StatTone, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

function SectionTitle({
  children,
  icon,
  tone,
  open,
  onToggle,
  summary,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: StatTone;
  open: boolean;
  onToggle: () => void;
  summary: string;
}) {
  return (
    <div className="mb-3 mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-soft)]">
      <ExpandButton open={open} onClick={onToggle} label={String(children)} />
      <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-white ${SECTION_TONE[tone]}`}>{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{children}</h2>
      <span className="ml-auto text-xs font-medium text-ink">{summary}</span>
    </div>
  );
}
