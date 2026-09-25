import { Injectable, Logger } from '@nestjs/common';
import {
  AssistantProviderError,
  type AssistantFailure,
  type AssistantProvider,
  type AssistantRequest,
  type AssistantResponse,
} from './assistant-provider.interface';
import { classifyHttpFailure, DEFAULT_ASSISTANT_MODEL } from './assistant.util';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Appel de l'API Messages d'Anthropic (Claude Haiku 4.5 par défaut). Aucun SDK : un seul appel HTTP, une seule nouvelle
 * tentative sur une panne passagère. La clé vient de `ANTHROPIC_API_KEY` (jamais dans le dépôt ni dans une conversation).
 * Toute erreur remonte en `AssistantProviderError` classée : c'est l'appelant qui décide du repli.
 */
@Injectable()
export class AnthropicAssistantProvider implements AssistantProvider {
  private readonly logger = new Logger(AnthropicAssistantProvider.name);

  isConfigured(): boolean {
    return (process.env.ANTHROPIC_API_KEY ?? '').trim() !== '';
  }

  model(): string {
    return (
      (process.env.ASSISTANT_MODELE ?? '').trim() || DEFAULT_ASSISTANT_MODEL
    );
  }

  async complete(request: AssistantRequest): Promise<AssistantResponse> {
    const key = (process.env.ANTHROPIC_API_KEY ?? '').trim();
    if (key === '') throw new AssistantProviderError('AUTH', 'Clé absente.');
    const timeoutMs = Number(process.env.ASSISTANT_DELAI_MS) || 20_000;

    let last: AssistantProviderError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
      try {
        return await this.once(request, key, timeoutMs);
      } catch (err) {
        if (!(err instanceof AssistantProviderError)) throw err;
        last = err;
        // Seules les pannes passagères méritent une seconde tentative.
        if (err.reason !== 'SURCHARGE' && err.reason !== 'DELAI') throw err;
      }
    }
    throw last ?? new AssistantProviderError('AUTRE');
  }

  private async once(
    request: AssistantRequest,
    key: string,
    timeoutMs: number,
  ): Promise<AssistantResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model(),
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = (err as Error).name === 'AbortError';
      throw new AssistantProviderError(
        timedOut ? 'DELAI' : 'AUTRE',
        timedOut ? 'Délai dépassé.' : 'Service injoignable.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const reason: AssistantFailure = classifyHttpFailure(
        res.status,
        body,
        res.headers.has('retry-after'),
      );
      // Le code HTTP est journalisé (jamais le corps : il pourrait citer la requête).
      this.logger.warn(`Assistant : réponse ${res.status} (${reason}).`);
      throw new AssistantProviderError(reason, `HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    return {
      text,
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    };
  }
}
