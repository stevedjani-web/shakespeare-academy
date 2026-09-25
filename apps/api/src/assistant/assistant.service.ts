import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { MessagingService, type Actor } from '../messaging/messaging.service';
import { looksLikePhoneNumber } from '../messaging/messaging.util';
import { OccurrencesService } from '../timetable/occurrences.service';
import { AttendanceService } from '../attendance/attendance.service';
import { TextbookService } from '../textbook/textbook.service';
import { FinancialStatusService } from '../financial-status/financial-status.service';
import { dayInTimezone } from '../attendance/attendance.util';
import { currentLanguage, pick, type AppLanguage } from '../common/language';
import {
  ASSISTANT_PROVIDER,
  AssistantProviderError,
  type AssistantFailure,
  type AssistantProvider,
  type AssistantResponse,
} from './assistant-provider.interface';
import { AssistantHealth } from './assistant-health';
import {
  buildSystemPrompt,
  buildUserPrompt,
  costMicroUsd,
  MESSAGE_MAX_LENGTH,
  parseModelOutput,
  shortDay,
} from './assistant.util';

/** Appels par utilisateur et par heure : au-delà, on laisse rédiger à la main (protège aussi le budget). */
export const MAX_SUGGESTIONS_PER_HOUR = 30;
const MAX_OUTPUT_TOKENS = 700;
const CENT_IN_MICRO_USD = 10_000;

export type UnavailableReason =
  | 'DESACTIVE'
  | 'NON_CONFIGURE'
  | 'PLAFOND'
  | 'TROP_DE_DEMANDES'
  | 'REJETE'
  // Ce que voit le personnel ordinaire quand le prestataire est en cause : jamais le détail (crédit, clé…).
  | 'INDISPONIBLE'
  | AssistantFailure;

export type SuggestResult =
  | {
      disponible: true;
      reponse: string;
      incertain: boolean;
      raisons: string[];
      sources: string[];
    }
  | { disponible: false; raison: UnavailableReason; message: string };

const UNAVAILABLE_TEXT: Record<
  UnavailableReason,
  Record<AppLanguage, string>
> = {
  DESACTIVE: {
    fr: "L'assistant de rédaction n'est pas activé pour cette école.",
    en: 'The writing assistant is not enabled for this school.',
  },
  NON_CONFIGURE: {
    fr: "L'assistant de rédaction n'est pas configuré. Rédigez votre réponse.",
    en: 'The writing assistant is not configured. Please write your reply yourself.',
  },
  PLAFOND: {
    fr: 'Le plafond mensuel de l’assistant est atteint. Rédigez votre réponse.',
    en: 'The assistant’s monthly limit has been reached. Please write your reply yourself.',
  },
  TROP_DE_DEMANDES: {
    fr: 'Trop de suggestions demandées en peu de temps. Rédigez votre réponse ou réessayez plus tard.',
    en: 'Too many suggestions requested in a short time. Write your reply yourself or try again later.',
  },
  REJETE: {
    fr: "Le brouillon proposé n'était pas utilisable. Rédigez votre réponse ou réessayez.",
    en: 'The suggested draft could not be used. Write your reply yourself or try again.',
  },
  INDISPONIBLE: {
    fr: "L'assistant de rédaction est momentanément indisponible. Rédigez votre réponse.",
    en: 'The writing assistant is temporarily unavailable. Please write your reply yourself.',
  },
  CREDIT: {
    fr: "L'assistant est indisponible : le crédit du service est épuisé ou un plafond de dépense est atteint. Rédigez votre réponse.",
    en: 'The assistant is unavailable: the service credit is exhausted or a spending limit has been reached. Please write your reply yourself.',
  },
  AUTH: {
    fr: "L'assistant est indisponible : la clé du service est absente ou refusée. Rédigez votre réponse.",
    en: 'The assistant is unavailable: the service key is missing or was refused. Please write your reply yourself.',
  },
  LIMITE: {
    fr: "L'assistant est indisponible : le service a atteint une limite d'usage. Rédigez votre réponse.",
    en: 'The assistant is unavailable: the service has reached a usage limit. Please write your reply yourself.',
  },
  SURCHARGE: {
    fr: "L'assistant est momentanément surchargé. Rédigez votre réponse ou réessayez dans un instant.",
    en: 'The assistant is temporarily overloaded. Write your reply yourself or try again in a moment.',
  },
  DELAI: {
    fr: "L'assistant n'a pas répondu à temps. Rédigez votre réponse ou réessayez.",
    en: 'The assistant did not reply in time. Write your reply yourself or try again.',
  },
  AUTRE: {
    fr: "L'assistant est momentanément indisponible. Rédigez votre réponse.",
    en: 'The writing assistant is temporarily unavailable. Please write your reply yourself.',
  },
};

const PROVIDER_REASONS: ReadonlySet<UnavailableReason> = new Set([
  'CREDIT',
  'AUTH',
  'LIMITE',
  'SURCHARGE',
  'DELAI',
  'AUTRE',
  'NON_CONFIGURE',
]);

/**
 * Lot 22 : assistant de rédaction de la messagerie, mode brouillon (D144 à D150). Il propose un texte au membre du
 * personnel qui répond ; rien n'est jamais envoyé au parent sans qu'un humain l'ait relu et envoyé lui-même.
 *
 * Garanties structurantes :
 * - REPLI TOUJOURS : une panne du prestataire (crédit épuisé, clé refusée, saturation, délai), un plafond atteint,
 *   un assistant éteint ou non configuré ne produisent jamais une erreur bloquante : la réponse est
 *   `{ disponible: false }` avec une phrase claire, et la messagerie continue de fonctionner à la main ;
 * - MINIMUM DE DONNÉES : le prénom de l'élève et sa classe, jamais le nom, le téléphone ni l'e-mail d'un parent, jamais
 *   la discipline ni les notes ; les faits (emploi du temps, devoirs, absences, situation financière) ne sont fournis que
 *   si le rôle de celui qui répond a le droit de les lire, et sont ceux que le parent voit déjà dans son espace ;
 * - RIEN D'AUTOMATIQUE : mêmes contrôles d'accès que pour répondre à la main, mêmes règles sur les numéros (RV09) ;
 * - TRACE : chaque appel est compté (jetons, coût) et journalisé sans jamais le texte des messages ni du brouillon.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
    private readonly messaging: MessagingService,
    private readonly occurrences: OccurrencesService,
    private readonly attendance: AttendanceService,
    private readonly textbook: TextbookService,
    private readonly financialStatus: FinancialStatusService,
    private readonly health: AssistantHealth,
    @Inject(ASSISTANT_PROVIDER) private readonly provider: AssistantProvider,
  ) {}

  // ------------------------------------------------------------------ Aides

  private isManager(actor: Actor): boolean {
    return actor.permissions.includes('PEDAGOGY_MANAGE');
  }

  private unavailable(
    actor: Actor,
    reason: UnavailableReason,
  ): SuggestResult & { disponible: false } {
    // Le personnel ordinaire ne voit jamais un détail de facturation : « indisponible » seulement.
    const shown: UnavailableReason =
      !this.isManager(actor) && PROVIDER_REASONS.has(reason)
        ? 'INDISPONIBLE'
        : reason;
    const lang = currentLanguage();
    return {
      disponible: false,
      raison: shown,
      message: UNAVAILABLE_TEXT[shown][lang],
    };
  }

  private async monthUsage(): Promise<{
    coutMicroUsd: number;
    appels: number;
  }> {
    const tz = (
      await this.prisma.school.findFirstOrThrow({
        select: { fuseauHoraire: true },
      })
    ).fuseauHoraire;
    const month = dayInTimezone(new Date(), tz).slice(0, 7);
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const agg = await this.prisma.assistantUsage.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { coutMicroUsd: true },
      _count: { _all: true },
    });
    return {
      coutMicroUsd: agg._sum.coutMicroUsd ?? 0,
      appels: agg._count._all,
    };
  }

  private async safeAudit(
    userId: string,
    action: string,
    entiteId: string | null,
    nouvelleValeur: unknown,
  ) {
    try {
      await this.audit.log({
        schoolId: await this.school.getDefaultId(),
        userId,
        action,
        entite: 'AssistantMessagerie',
        entiteId,
        ancienneValeur: null,
        nouvelleValeur,
      });
    } catch (err) {
      this.logger.error(`Journal de l'assistant : ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------- État et réglages

  /** Ce que l'écran de messagerie doit savoir pour afficher (ou cacher) le bouton de suggestion. */
  async status(actor: Actor) {
    const school = await this.prisma.school.findFirstOrThrow({
      select: { assistantActif: true, assistantPlafondCentimes: true },
    });
    let raison: UnavailableReason | null = null;
    if (!school.assistantActif) raison = 'DESACTIVE';
    else if (!this.provider.isConfigured()) raison = 'NON_CONFIGURE';
    else if (this.health.paused()) raison = this.health.paused();
    else {
      const usage = await this.monthUsage();
      if (
        usage.coutMicroUsd >=
        school.assistantPlafondCentimes * CENT_IN_MICRO_USD
      )
        raison = 'PLAFOND';
    }
    if (raison === null) return { actif: true, disponible: true as const };
    const shown: UnavailableReason =
      !this.isManager(actor) && PROVIDER_REASONS.has(raison)
        ? 'INDISPONIBLE'
        : raison;
    return {
      actif: school.assistantActif,
      disponible: false as const,
      raison: shown,
    };
  }

  /** Réglages, coût du mois et état du prestataire pour la Direction (PEDAGOGY_MANAGE). */
  async getSettings() {
    const school = await this.prisma.school.findFirstOrThrow({
      select: {
        assistantActif: true,
        assistantPlafondCentimes: true,
        assistantFaq: true,
      },
    });
    const usage = await this.monthUsage();
    return {
      actif: school.assistantActif,
      plafondMensuelCentimes: school.assistantPlafondCentimes,
      faq: school.assistantFaq,
      configure: this.provider.isConfigured(),
      modele: this.provider.model(),
      utilisationMois: {
        appels: usage.appels,
        // Millionièmes de dollar (entier) ; l'écran les convertit en dollars.
        coutMicroUsd: usage.coutMicroUsd,
      },
      etat: {
        raison: this.health.paused() ?? this.health.lastDurable(),
        enPause: this.health.paused() !== null,
      },
    };
  }

  async updateSettings(
    dto: {
      actif?: boolean;
      plafondMensuelCentimes?: number;
      faq?: string | null;
    },
    userId: string,
  ) {
    const before = await this.prisma.school.findFirstOrThrow({
      select: {
        id: true,
        assistantActif: true,
        assistantPlafondCentimes: true,
        assistantFaq: true,
      },
    });
    const data: {
      assistantActif?: boolean;
      assistantPlafondCentimes?: number;
      assistantFaq?: string | null;
    } = {};
    if (dto.actif !== undefined) data.assistantActif = dto.actif;
    if (dto.plafondMensuelCentimes !== undefined)
      data.assistantPlafondCentimes = dto.plafondMensuelCentimes;
    if (dto.faq !== undefined) {
      const faq = dto.faq === null ? '' : dto.faq.trim();
      if (faq !== '') {
        const school = await this.prisma.school.findFirstOrThrow({
          select: { messageNumeroMinChiffres: true },
        });
        // Un numéro dans la FAQ finirait dans un brouillon que la messagerie refuse (RV09).
        if (looksLikePhoneNumber(faq, school.messageNumeroMinChiffres)) {
          throw new UnprocessableEntityException(
            pick({
              fr: "N'écrivez pas de numéro de téléphone dans la FAQ : la messagerie n'en accepte pas.",
              en: 'Do not write a phone number in the FAQ: the messaging does not accept them.',
            }),
          );
        }
      }
      data.assistantFaq = faq === '' ? null : faq;
    }
    await this.prisma.school.update({ where: { id: before.id }, data });
    await this.safeAudit(userId, 'ASSISTANT_SETTINGS_UPDATE', before.id, {
      // Le contenu de la FAQ n'est pas journalisé : seulement qu'elle a changé.
      avant: {
        actif: before.assistantActif,
        plafondCentimes: before.assistantPlafondCentimes,
      },
      apres: {
        actif: data.assistantActif ?? before.assistantActif,
        plafondCentimes:
          data.assistantPlafondCentimes ?? before.assistantPlafondCentimes,
        faqModifiee: dto.faq !== undefined,
      },
    });
    return this.getSettings();
  }

  // ------------------------------------------------------------------ Faits

  /** Faits de la base, selon les droits de celui qui répond : ceux que le parent voit déjà dans son espace. */
  private async gatherFacts(
    actor: Actor,
    studentId: string,
    today: string,
    devise: string,
    lang: AppLanguage,
  ) {
    const can = (p: string) => actor.permissions.includes(p);
    const facts: Array<{ title: string; lines: string[] }> = [];
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, statut: 'ACTIVE' },
      orderBy: { academicYear: { dateDebut: 'desc' } },
      include: { class: { select: { id: true, nom: true } } },
    });

    if (enrollment && can('TIMETABLE_READ')) {
      const week = await this.occurrences.week(today, {
        classId: enrollment.classId,
      });
      const lines: string[] = [];
      for (const day of week.jours) {
        const label = shortDay(day.date, lang);
        if (day.sansClasse) {
          lines.push(`${label} : ${day.sansClasse.libelle} (pas de classe)`);
          continue;
        }
        if (day.seances.length === 0) continue;
        const parts = day.seances.map((s) => {
          const note =
            s.statut === 'ANNULEE'
              ? ' [annulée]'
              : s.statut === 'REMPLACEE'
                ? ' [enseignant remplacé]'
                : s.statut === 'SALLE_MODIFIEE'
                  ? ' [salle modifiée]'
                  : '';
          return `${s.heureDebut}-${s.heureFin} ${s.subjectName} (${s.roomName ?? 'salle ?'})${note}`;
        });
        lines.push(`${label} : ${parts.join(' ; ')}`);
      }
      facts.push({ title: 'Emploi du temps de la semaine', lines });
    }

    if (can('TEXTBOOK_READ') || can('TEXTBOOK_WRITE')) {
      const book = await this.textbook.forStudent(studentId);
      const lines: string[] = [];
      for (const d of book.aVenir.slice(0, 8)) {
        lines.push(
          `À rendre pour le ${d.dateEcheance} (${d.matiere}) : ${String(d.devoirs).slice(0, 200)}`,
        );
      }
      for (const e of book.entrees.slice(0, 6)) {
        if (e.contenu)
          lines.push(
            `Cours du ${e.date} (${e.matiere}) : ${String(e.contenu).slice(0, 200)}`,
          );
      }
      facts.push({ title: 'Devoirs et cahier de textes', lines });
    }

    if (can('ATTENDANCE_READ')) {
      const from = new Date(`${today}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 30);
      const history = await this.attendance.studentHistory(
        studentId,
        from.toISOString().slice(0, 10),
        today,
      );
      const lines = history.lignes.slice(0, 12).map((l) => {
        const status = l.statut === 'ABSENT' ? 'absent' : 'en retard';
        const late =
          l.statut === 'RETARD' && l.minutesRetard
            ? ` de ${l.minutesRetard} min`
            : '';
        // Ni le motif ni le commentaire d'un justificatif : seulement son état (RV12).
        const just = l.justification
          ? l.justification.statut === 'ACCEPTEE'
            ? ', justifié'
            : l.justification.statut === 'REFUSEE'
              ? ', justificatif refusé'
              : ', justificatif en attente'
          : '';
        return `${shortDay(l.date, lang)} ${l.heureDebut} ${l.matiere} : ${status}${late}${just}`;
      });
      facts.push({
        title: 'Absences et retards des 30 derniers jours',
        lines,
      });
    }

    if (can('FINANCE_READ')) {
      const status = await this.financialStatus.getForStudent(studentId);
      const lines = [
        `Situation : ${status.statut}`,
        `Restant dû : ${status.montantRestant} ${devise}`,
        `Déjà exigible : ${status.montantExigible} ${devise}`,
      ];
      if (status.prochaineEcheance)
        lines.push(
          `Prochaine échéance : ${JSON.stringify(status.prochaineEcheance)}`,
        );
      facts.push({ title: 'Situation financière', lines });
    }

    return { facts, className: enrollment?.class.nom ?? null };
  }

  // ------------------------------------------------------------- Suggestion

  async suggest(
    actor: Actor,
    threadId: string,
    instruction?: string,
  ): Promise<SuggestResult> {
    // Mêmes contrôles que pour répondre à la main : 404 hors de ses conversations, 422 si on ne peut pas répondre.
    const ctx = await this.messaging.assistantThreadContext(actor, threadId);

    const school = await this.prisma.school.findFirstOrThrow({
      select: {
        id: true,
        nom: true,
        devise: true,
        fuseauHoraire: true,
        assistantActif: true,
        assistantPlafondCentimes: true,
        assistantFaq: true,
        messageNumeroMinChiffres: true,
      },
    });
    if (!school.assistantActif) return this.unavailable(actor, 'DESACTIVE');
    if (!this.provider.isConfigured())
      return this.unavailable(actor, 'NON_CONFIGURE');
    const paused = this.health.paused();
    if (paused) return this.unavailable(actor, paused);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.assistantUsage.count({
      where: { userId: actor.id, createdAt: { gte: oneHourAgo } },
    });
    if (recent >= MAX_SUGGESTIONS_PER_HOUR)
      return this.unavailable(actor, 'TROP_DE_DEMANDES');
    const usage = await this.monthUsage();
    if (
      usage.coutMicroUsd >=
      school.assistantPlafondCentimes * CENT_IN_MICRO_USD
    )
      return this.unavailable(actor, 'PLAFOND');

    const today = dayInTimezone(new Date(), school.fuseauHoraire);
    const uiLanguage = currentLanguage();
    let system: string;
    let user: string;
    try {
      const { facts, className } = await this.gatherFacts(
        actor,
        ctx.studentId,
        today,
        school.devise,
        ctx.parentLanguage,
      );
      system = buildSystemPrompt({
        schoolName: school.nom,
        authorFirstName: actor.prenom,
        uiLanguage,
      });
      user = buildUserPrompt({
        today,
        studentFirstName: ctx.studentFirstName,
        className,
        facts,
        faq: school.assistantFaq,
        instruction: instruction?.trim() ? instruction.trim() : null,
        conversation: ctx.messages,
      });
    } catch (err) {
      // Les faits n'ont pas pu être rassemblés : on n'envoie rien, on laisse rédiger à la main.
      this.logger.error(
        `Assistant : faits indisponibles : ${(err as Error).message}`,
      );
      return this.unavailable(actor, 'AUTRE');
    }

    const modele = this.provider.model();
    let output: AssistantResponse;
    try {
      output = await this.provider.complete({
        system,
        user,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
    } catch (err) {
      const reason: AssistantFailure =
        err instanceof AssistantProviderError ? err.reason : 'AUTRE';
      const justPaused = this.health.failed(reason);
      await this.prisma.assistantUsage
        .create({
          data: {
            userId: actor.id,
            threadId,
            modele,
            statut: 'ECHEC',
            raison: reason,
          },
        })
        .catch(() => undefined);
      if (justPaused) {
        this.logger.warn(`Assistant en pause : ${reason}.`);
        await this.safeAudit(actor.id, 'ASSISTANT_PAUSED', null, {
          raison: reason,
        });
      }
      await this.safeAudit(actor.id, 'ASSISTANT_SUGGEST', threadId, {
        statut: 'ECHEC',
        raison: reason,
      });
      return this.unavailable(actor, reason);
    }

    const cost = costMicroUsd(output.inputTokens, output.outputTokens);
    const recovered = this.health.succeeded();
    const draft = parseModelOutput(output.text);
    // Un brouillon vide, trop long ou qui ressemble à un numéro de téléphone serait refusé par la messagerie (RV09).
    const usable =
      draft !== null &&
      draft.reponse.length <= MESSAGE_MAX_LENGTH &&
      !looksLikePhoneNumber(draft.reponse, school.messageNumeroMinChiffres);
    await this.prisma.assistantUsage
      .create({
        data: {
          userId: actor.id,
          threadId,
          modele,
          statut: usable ? 'OK' : 'REJETE',
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          coutMicroUsd: cost,
        },
      })
      .catch(() => undefined);
    if (recovered)
      await this.safeAudit(actor.id, 'ASSISTANT_RECOVERED', null, null);
    await this.safeAudit(actor.id, 'ASSISTANT_SUGGEST', threadId, {
      statut: usable ? 'OK' : 'REJETE',
      entree: output.inputTokens,
      sortie: output.outputTokens,
      coutMicroUsd: cost,
    });
    if (!usable || draft === null) return this.unavailable(actor, 'REJETE');
    return {
      disponible: true,
      reponse: draft.reponse,
      incertain: draft.incertain,
      raisons: draft.raisons,
      sources: draft.sources,
    };
  }
}
