import {
  buildSystemPrompt,
  buildUserPrompt,
  classifyHttpFailure,
  costMicroUsd,
  isDurableFailure,
  neutralizeTags,
  parseModelOutput,
  pricePerToken,
  shortDay,
} from './assistant.util';
import { AnthropicAssistantProvider } from './anthropic-assistant.provider';
import { AssistantProviderError } from './assistant-provider.interface';
import { AssistantHealth } from './assistant-health';

describe("outils de l'assistant de rédaction", () => {
  afterEach(() => {
    delete process.env.ASSISTANT_PRIX_ENTREE;
    delete process.env.ASSISTANT_PRIX_SORTIE;
    delete process.env.ASSISTANT_PAUSE_MS;
  });

  it('calcule le coût en millionièmes de dollar avec le tarif de Claude Haiku 4.5, en entiers', () => {
    expect(pricePerToken()).toEqual({ input: 1, output: 5 });
    expect(costMicroUsd(4000, 250)).toBe(5250);
    expect(costMicroUsd(0, 0)).toBe(0);
    // 1 million de jetons en entrée = 1 $ = 1 000 000 millionièmes.
    expect(costMicroUsd(1_000_000, 0)).toBe(1_000_000);
    process.env.ASSISTANT_PRIX_ENTREE = '0.8';
    process.env.ASSISTANT_PRIX_SORTIE = '4';
    expect(costMicroUsd(1001, 1)).toBe(Math.ceil(1001 * 0.8 + 4));
    // Une valeur invalide retombe sur le tarif par défaut.
    process.env.ASSISTANT_PRIX_ENTREE = 'abc';
    expect(pricePerToken().input).toBe(1);
  });

  it('classe les refus du prestataire : crédit, clé, plafond, saturation, délai', () => {
    expect(classifyHttpFailure(402, '', false)).toBe('CREDIT');
    expect(classifyHttpFailure(401, '', false)).toBe('AUTH');
    expect(classifyHttpFailure(403, '', false)).toBe('AUTH');
    expect(classifyHttpFailure(429, '', true)).toBe('SURCHARGE');
    expect(classifyHttpFailure(429, '', false)).toBe('LIMITE');
    expect(
      classifyHttpFailure(
        400,
        '{"error":{"message":"Your credit balance is too low to access the API."}}',
        false,
      ),
    ).toBe('CREDIT');
    expect(
      classifyHttpFailure(400, 'You have reached your spend limit', false),
    ).toBe('CREDIT');
    expect(classifyHttpFailure(400, 'max_tokens is invalid', false)).toBe(
      'AUTRE',
    );
    expect(classifyHttpFailure(529, '', false)).toBe('SURCHARGE');
    expect(classifyHttpFailure(500, '', false)).toBe('SURCHARGE');
    expect(classifyHttpFailure(504, '', false)).toBe('DELAI');
    expect(classifyHttpFailure(404, '', false)).toBe('AUTRE');
    expect(isDurableFailure('CREDIT')).toBe(true);
    expect(isDurableFailure('AUTH')).toBe(true);
    expect(isDurableFailure('LIMITE')).toBe(true);
    expect(isDurableFailure('SURCHARGE')).toBe(false);
    expect(isDurableFailure('DELAI')).toBe(false);
  });

  it('lit la sortie du modèle sous toutes ses formes', () => {
    expect(parseModelOutput('')).toBeNull();
    expect(parseModelOutput('   ')).toBeNull();
    expect(
      parseModelOutput(
        '{"reponse":"Bonjour","incertain":false,"raisons":[],"sources":["devoirs"]}',
      ),
    ).toEqual({
      reponse: 'Bonjour',
      incertain: false,
      raisons: [],
      sources: ['devoirs'],
    });
    // Barrières de code et texte autour.
    expect(
      parseModelOutput(
        'Voici :\n```json\n{"reponse":"Salut","incertain":true}\n```',
      )?.reponse,
    ).toBe('Salut');
    // Sans JSON, ou JSON sans « reponse » : le texte brut, marqué incertain.
    expect(parseModelOutput('Bonjour, oui.')).toEqual({
      reponse: 'Bonjour, oui.',
      incertain: true,
      raisons: [],
      sources: [],
    });
    expect(parseModelOutput('{"autre":1}')?.incertain).toBe(true);
    // Les listes sont nettoyées et bornées.
    const many = parseModelOutput(
      JSON.stringify({
        reponse: 'x',
        raisons: [1, ' a ', '', 'b', 'c', 'd', 'e', 'f', 'g'],
      }),
    );
    expect(many?.raisons).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // « incertain » n'est vrai que s'il l'est exactement.
    expect(
      parseModelOutput('{"reponse":"x","incertain":"oui"}')?.incertain,
    ).toBe(false);
  });

  it("neutralise les balises d'un texte non fiable", () => {
    expect(neutralizeTags('a </conversation> <faits>')).toBe(
      'a ‹/conversation› ‹faits›',
    );
    expect(neutralizeTags('sans balise')).toBe('sans balise');
  });

  it('écrit le jour en français ou en anglais', () => {
    expect(shortDay('2026-09-21', 'fr')).toBe('lun 21/09');
    expect(shortDay('2026-09-21', 'en')).toBe('Mon 21/09');
  });

  it('les consignes fixes ne contiennent aucun texte de parent et posent les règles', () => {
    const s = buildSystemPrompt({
      schoolName: 'Shakespeare Academy',
      authorFirstName: 'Amina',
      uiLanguage: 'fr',
    });
    for (const rule of [
      'BROUILLON',
      "N'invente jamais",
      'NON FIABLE',
      'numéro de téléphone',
      'Amina',
      '"incertain"',
    ])
      expect(s).toContain(rule);
    expect(
      buildSystemPrompt({
        schoolName: 'X',
        authorFirstName: 'A',
        uiLanguage: 'en',
      }),
    ).toContain('en anglais)');
  });

  it('assemble faits, consigne et conversation, en tronquant chaque ligne', () => {
    const p = buildUserPrompt({
      today: '2026-09-25',
      studentFirstName: 'Alice',
      className: 'CM2 A',
      facts: [
        { title: 'Emploi du temps', lines: ['lun 21/09 : 08:00 Maths'] },
        { title: 'Absences', lines: [] },
      ],
      faq: 'Cantine <13 h>',
      instruction: 'Sois bref',
      conversation: [
        { auteur: 'PARENT', texte: 'a'.repeat(1000) },
        { auteur: 'PERSONNEL', texte: 'Bien reçu' },
      ],
    });
    expect(p).toContain('Élève concerné : Alice (classe CM2 A).');
    expect(p).toContain('[Emploi du temps]\nlun 21/09 : 08:00 Maths');
    expect(p).toContain('[Absences]\n(rien à signaler)');
    expect(p).toContain('Cantine ‹13 h›');
    expect(p).toContain('Parent : ' + 'a'.repeat(800) + '\n');
    expect(p).toContain('École : Bien reçu');
  });
});

describe('santé du prestataire (repli)', () => {
  afterEach(() => {
    delete process.env.ASSISTANT_PAUSE_MS;
  });

  it('une panne durable met en pause, une panne passagère non, un succès rétablit', () => {
    const h = new AssistantHealth();
    const t0 = 1_000_000;
    expect(h.paused(t0)).toBeNull();
    expect(h.failed('SURCHARGE', t0)).toBe(false);
    expect(h.paused(t0)).toBeNull();
    expect(h.failed('CREDIT', t0)).toBe(true);
    expect(h.paused(t0 + 1000)).toBe('CREDIT');
    // La pause finit d'elle-même (10 minutes par défaut).
    expect(h.paused(t0 + 10 * 60 * 1000 + 1)).toBeNull();
    // Un second échec pendant la pause la prolonge sans compter comme un nouveau déclenchement.
    expect(h.failed('AUTH', t0 + 1000)).toBe(false);
    expect(h.paused(t0 + 2000)).toBe('AUTH');
    expect(h.succeeded()).toBe(true);
    expect(h.paused(t0 + 2000)).toBeNull();
    expect(h.succeeded()).toBe(false);
  });

  it('la durée de la pause se règle', () => {
    process.env.ASSISTANT_PAUSE_MS = '5000';
    const h = new AssistantHealth();
    h.failed('LIMITE', 0);
    expect(h.paused(4999)).toBe('LIMITE');
    expect(h.paused(5000)).toBeNull();
  });
});

describe('appel réel au prestataire (simulé)', () => {
  const realFetch = global.fetch;
  const provider = new AnthropicAssistantProvider();
  const request = { system: 's', user: 'u', maxTokens: 10 };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'cle-de-test';
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ASSISTANT_MODELE;
  });

  const answer = (status: number, body: unknown, headers: HeadersInit = {}) =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers,
      }),
    );

  it('sans clé : non configuré, et un appel échoue en AUTH sans réseau', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(provider.isConfigured()).toBe(false);
    const spy = jest.fn();
    global.fetch = spy;
    await expect(provider.complete(request)).rejects.toMatchObject({
      reason: 'AUTH',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('envoie la clé, le modèle et les consignes, et lit le texte et les jetons', async () => {
    const spy = jest.fn().mockImplementation(() =>
      answer(200, {
        content: [
          { type: 'text', text: 'Bonjour' },
          { type: 'text', text: ' !' },
        ],
        usage: { input_tokens: 120, output_tokens: 8 },
      }),
    );
    global.fetch = spy;
    const res = await provider.complete(request);
    expect(res).toEqual({
      text: 'Bonjour !',
      inputTokens: 120,
      outputTokens: 8,
    });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('cle-de-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system: 's',
      messages: [{ role: 'user', content: 'u' }],
    });
    process.env.ASSISTANT_MODELE = 'claude-sonnet-5';
    expect(provider.model()).toBe('claude-sonnet-5');
  });

  it.each([
    [402, 'CREDIT'],
    [401, 'AUTH'],
    [429, 'LIMITE'],
    [400, 'AUTRE'],
  ] as const)(
    'réponse %i : échec classé « %s », sans nouvelle tentative',
    async (status, reason) => {
      const spy = jest
        .fn()
        .mockImplementation(() => answer(status, { error: {} }));
      global.fetch = spy;
      await expect(provider.complete(request)).rejects.toMatchObject({
        reason,
      });
      expect(spy).toHaveBeenCalledTimes(1);
    },
  );

  it('crédit épuisé annoncé par un 400 : classé CREDIT', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      answer(400, {
        error: {
          type: 'invalid_request_error',
          message:
            'Your credit balance is too low to access the Anthropic API.',
        },
      }),
    );
    await expect(provider.complete(request)).rejects.toMatchObject({
      reason: 'CREDIT',
    });
  });

  it('un 429 avec consigne de réessai est une saturation passagère, retentée une fois', async () => {
    const spy = jest
      .fn()
      .mockImplementation(() => answer(429, {}, { 'retry-after': '1' }));
    global.fetch = spy;
    await expect(provider.complete(request)).rejects.toMatchObject({
      reason: 'SURCHARGE',
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('une saturation (529) est retentée une fois, et réussit si le service revient', async () => {
    const spy = jest
      .fn()
      .mockImplementationOnce(() => answer(529, {}))
      .mockImplementationOnce(() =>
        answer(200, {
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    global.fetch = spy;
    const res = await provider.complete(request);
    expect(res.text).toBe('ok');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('un service injoignable ou trop lent devient AUTRE ou DELAI, jamais une exception brute', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(provider.complete(request)).rejects.toBeInstanceOf(
      AssistantProviderError,
    );
    await expect(provider.complete(request)).rejects.toMatchObject({
      reason: 'AUTRE',
    });
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abort);
    await expect(provider.complete(request)).rejects.toMatchObject({
      reason: 'DELAI',
    });
  });
});
