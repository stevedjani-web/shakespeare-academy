/**
 * Lot 22 : assistant de rédaction de la messagerie. Le prestataire d'IA est derrière cette interface (comme le
 * service d'alertes push et PawaPay) : les tests branchent un faux, aucun appel réel n'a lieu hors production.
 */

export interface AssistantRequest {
  /** Consignes fixes (rôle, règles, format) : jamais de texte d'un parent ici. */
  system: string;
  /** Faits de la base, consigne du personnel et conversation (le texte des parents y est balisé comme non fiable). */
  user: string;
  maxTokens: number;
}

export interface AssistantResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Pourquoi le prestataire n'a pas répondu :
 * - CREDIT : solde épuisé, limite de dépense atteinte ou problème de paiement ;
 * - AUTH : clé absente, refusée ou sans droit ;
 * - LIMITE : limite de débit ou plafond du prestataire atteint, sans consigne de réessai ;
 * - SURCHARGE : service saturé ou en panne passagère ;
 * - DELAI : pas de réponse à temps ;
 * - AUTRE : tout le reste (réseau, requête refusée).
 */
export type AssistantFailure =
  'CREDIT' | 'AUTH' | 'LIMITE' | 'SURCHARGE' | 'DELAI' | 'AUTRE';

export class AssistantProviderError extends Error {
  constructor(
    readonly reason: AssistantFailure,
    detail?: string,
  ) {
    super(detail ?? reason);
  }
}

export interface AssistantProvider {
  /** Faux si aucune clé n'est configurée : l'assistant se déclare alors indisponible, sans erreur. */
  isConfigured(): boolean;
  /** Modèle utilisé (enregistré avec chaque appel). */
  model(): string;
  complete(request: AssistantRequest): Promise<AssistantResponse>;
}

export const ASSISTANT_PROVIDER = Symbol('ASSISTANT_PROVIDER');
