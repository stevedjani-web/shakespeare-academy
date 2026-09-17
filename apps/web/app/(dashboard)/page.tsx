"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatMontant } from "@/lib/format";
import type { AcademicYear, DashboardStats, Student } from "@/lib/types";
import { Badge, Button, Card, PageTitle, StatCard } from "@/components/ui";

export default function DashboardHomePage() {
  const { user, hasPermission } = useAuth();
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    void (async () => {
      const years = await api.get<AcademicYear[]>("/academic-years");
      setActiveYear(years.find((y) => y.statut === "ACTIVE") ?? null);
      const students = await api.get<Student[]>("/students");
      setStudentCount(students.length);
    })();
    void api.get<DashboardStats>("/reports/dashboard").then(setStats);
  }, []);

  return (
    <div>
      <PageTitle eyebrow="Tableau de bord" subtitle={`Bienvenue, ${user?.prenom} ${user?.nom}.`}>
        Bonjour {user?.prenom}
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Année scolaire active"
          value={activeYear ? activeYear.libelle : "Aucune"}
          tone="primary"
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
          <SectionTitle icon={<Users size={14} />}>Effectifs</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Élèves actifs"
              value={stats.effectifs.actifs}
              tone="accent"
              icon={<GraduationCap size={18} />}
              hint={stats.effectifs.inactifs > 0 ? `${stats.effectifs.inactifs} inactif(s)` : undefined}
            />
            <StatCard label="Garçons" value={stats.effectifs.parSexe.M} tone="primary" icon={<Users size={18} />} />
            <StatCard label="Filles" value={stats.effectifs.parSexe.F} tone="primary" icon={<Users size={18} />} />
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
              <div className="flex flex-wrap gap-2">
                {stats.repartition.parSection.map((s) => (
                  <Badge key={s.nom} color="primary">
                    {s.nom} — {s.effectif} élève(s)
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {stats.repartition.parClasse.length > 0 && (
            <Card className="mt-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Effectif par classe</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-ink-muted">
                      <th className="py-2 pr-4">Classe</th>
                      <th className="py-2 pr-4">Cycle</th>
                      <th className="py-2 pr-4">Section</th>
                      <th className="py-2 pr-4">Effectif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.repartition.parClasse.map((c) => (
                      <tr key={c.nom} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4 font-medium text-ink">{c.nom}</td>
                        <td className="py-2 pr-4 text-ink-muted">{c.cycle}</td>
                        <td className="py-2 pr-4 text-ink-muted">{c.section}</td>
                        <td className="py-2 pr-4 text-ink-muted">{c.effectif}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <SectionTitle icon={<Wallet size={14} />}>Finances (année active)</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total facturé" value={formatMontant(stats.financier.totalFacture)} tone="primary" icon={<Receipt size={18} />} />
            <StatCard label="Total encaissé" value={formatMontant(stats.financier.totalEncaisse)} tone="success" icon={<ArrowDownCircle size={18} />} />
            <StatCard label="Total remises" value={formatMontant(stats.financier.totalRemises)} tone="accent" icon={<Percent size={18} />} />
            <StatCard label="Restant dû" value={formatMontant(stats.financier.totalRestantDu)} tone="danger" icon={<TrendingUp size={18} />} />
            <StatCard
              label="Taux de recouvrement"
              value={stats.financier.tauxRecouvrement !== null ? `${stats.financier.tauxRecouvrement}%` : "—"}
              tone="primary"
              icon={<Percent size={18} />}
              hint={stats.financier.tauxRecouvrement === null ? "Aucune facture émise" : undefined}
            />
            <StatCard label="Solde de caisse cumulé" value={formatMontant(stats.financier.soldeCaisseCumule)} tone="success" icon={<PiggyBank size={18} />} />
            <StatCard label="Paiements en espèces" value={formatMontant(stats.paiements.parMode.ESPECES)} tone="primary" icon={<ArrowDownCircle size={18} />} />
            <StatCard label="Paiements Mobile Money" value={formatMontant(stats.paiements.parMode.MOBILE_MONEY)} tone="primary" icon={<ArrowDownCircle size={18} />} />
          </div>

          <SectionTitle icon={<ArrowUpCircle size={14} />}>Opérations en attente</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Remises en attente"
              value={stats.remises.enAttente}
              tone={stats.remises.enAttente > 0 ? "danger" : "success"}
              icon={<Percent size={18} />}
              hint={`${stats.remises.approuvees} approuvée(s) · ${stats.remises.rejetees} rejetée(s)`}
            />
            <StatCard
              label="Dépenses en attente"
              value={stats.depenses.enAttenteCount}
              tone={stats.depenses.enAttenteCount > 0 ? "danger" : "success"}
              icon={<ArrowUpCircle size={18} />}
              hint={stats.depenses.enAttenteCount > 0 ? formatMontant(stats.depenses.enAttenteMontant) : undefined}
            />
            <StatCard label="Sorties approuvées (total)" value={formatMontant(stats.depenses.totalApprouve)} tone="primary" icon={<ArrowUpCircle size={18} />} />
            <Link href="/insolvables">
              <StatCard
                label="Élèves insolvables"
                value={stats.insolvables.count}
                tone={stats.insolvables.count > 0 ? "danger" : "success"}
                icon={<AlertOctagon size={18} />}
                hint="Voir le détail"
              />
            </Link>
          </div>
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

function SectionTitle({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
      {icon} {children}
    </h2>
  );
}
