import {
  AssistantProviderError,
  type AssistantFailure,
  type AssistantProvider,
  type AssistantRequest,
  type AssistantResponse,
} from '../../src/assistant/assistant-provider.interface';

const DEFAULT_REPLY = JSON.stringify({
  reponse:
    'Bonjour,\n\nMerci de votre message. Le cours a lieu comme prévu.\n\nCordialement,\nAmina',
  incertain: false,
  raisons: [],
  sources: ['emploi du temps'],
});

/** Faux prestataire d'IA : enregistre ce qu'on lui envoie, ne contacte jamais Internet. */
export class FakeAssistantProvider implements AssistantProvider {
  configured = true;
  requests: AssistantRequest[] = [];
  /** Ce que le faux renvoie ; une fonction permet de dépendre de la requête. */
  reply: string | ((req: AssistantRequest) => string) = DEFAULT_REPLY;
  inputTokens = 4000;
  outputTokens = 250;
  /** Si renseigné, l'appel échoue avec cette cause (`throw` : une exception inattendue). */
  failWith: AssistantFailure | 'throw' | null = null;

  reset() {
    this.configured = true;
    this.requests = [];
    this.failWith = null;
    this.inputTokens = 4000;
    this.outputTokens = 250;
    this.reply = DEFAULT_REPLY;
  }

  isConfigured() {
    return this.configured;
  }

  model() {
    return 'claude-haiku-4-5-test';
  }

  // Volontairement `async` sans `await` : même signature que le vrai prestataire, qui attend le réseau.
  // eslint-disable-next-line @typescript-eslint/require-await
  async complete(req: AssistantRequest): Promise<AssistantResponse> {
    this.requests.push(req);
    if (this.failWith === 'throw')
      throw new Error('Panne inattendue (simulée).');
    if (this.failWith)
      throw new AssistantProviderError(this.failWith, 'simulé');
    return {
      text: typeof this.reply === 'function' ? this.reply(req) : this.reply,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
    };
  }
}
