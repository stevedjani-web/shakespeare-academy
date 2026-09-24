import { cleanText, excerpt, looksLikePhoneNumber } from './messaging.util';

describe('détection d’un numéro de téléphone (RV09)', () => {
  const refused = [
    '06 12 34 56 78',
    '0612345678',
    '+242 06 000 0001',
    '242-06-000-0001',
    'appelez le (06) 12 34 56 78',
    'mon numéro : 06.12.34.56.78',
  ];
  const accepted = [
    'Bonjour, une question sur les devoirs.',
    'Le contrôle est le 21.09.2026.',
    'Il reste 45000 FCFA à régler.',
    'Salle 12, 3e étage.',
    'Rendez-vous à 14h30, le 21/09/2026.',
    'Matricule 123456',
    '',
  ];

  it.each(refused)('refuse « %s » à 9 chiffres', (text) => {
    expect(looksLikePhoneNumber(text, 9)).toBe(true);
  });

  it.each(accepted)('accepte « %s » à 9 chiffres', (text) => {
    expect(looksLikePhoneNumber(text, 9)).toBe(false);
  });

  it('le seuil est un paramètre : 0 désactive, un seuil plus bas est plus strict', () => {
    expect(looksLikePhoneNumber('06 12 34 56 78', 0)).toBe(false);
    expect(looksLikePhoneNumber('Code 123456', 6)).toBe(true);
    expect(looksLikePhoneNumber('Code 123456', 9)).toBe(false);
  });

  it('nettoie les espaces et les retours à la ligne en trop', () => {
    expect(cleanText('  Bonjour\r\n\r\n\r\n\r\nMerci  ')).toBe(
      'Bonjour\n\nMerci',
    );
  });
});

describe('extrait d’un message pour le bandeau d’alerte', () => {
  it('garde un texte court tel quel, sur une seule ligne', () => {
    expect(excerpt('Bonjour,\n\n  merci   de passer.', 100)).toBe(
      'Bonjour, merci de passer.',
    );
  });

  it('coupe un texte long et ajoute une ellipse', () => {
    const out = excerpt('a'.repeat(150), 100);
    expect(out).toBe(`${'a'.repeat(100)}…`);
  });

  it('ne coupe jamais un émoji en deux', () => {
    const out = excerpt('🙂'.repeat(120), 100);
    expect(Array.from(out.replace('…', '')).every((c) => c === '🙂')).toBe(true);
    expect(Array.from(out).length).toBe(101);
  });

  it('un texte de la longueur exacte n’est pas tronqué', () => {
    expect(excerpt('b'.repeat(100), 100)).toBe('b'.repeat(100));
  });
});
