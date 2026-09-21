import { cleanText, looksLikePhoneNumber } from './messaging.util';

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
