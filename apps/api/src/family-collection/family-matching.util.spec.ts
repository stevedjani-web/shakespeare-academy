import { closeWords, editDistance, matchNames } from './family-matching.util';

describe('rapprochement des noms (tolérance à l’orthographe)', () => {
  it('compte les lettres d’écart', () => {
    expect(editDistance('CHLOE', 'KHLOE')).toBe(1);
    expect(editDistance('GALEBALI', 'NGALEBALY')).toBe(2);
    expect(editDistance('KABA', 'KABA')).toBe(0);
    expect(editDistance('', 'AB')).toBe(2);
  });

  it('rapproche une lettre d’écart à partir de 4 lettres, deux à partir de 6, jamais les mots courts', () => {
    expect(closeWords('CHLOE', 'KHLOE')).toBe(true);
    expect(closeWords('BERNADETTA', 'BERNADETTE')).toBe(true);
    expect(closeWords('NGIMBIS', 'NGUIBIS')).toBe(true); // deux lettres, 7 lettres
    expect(closeWords('MARC', 'MARK')).toBe(true); // une lettre, 4 lettres
    expect(closeWords('ALI', 'ALY')).toBe(false); // trop court
    expect(closeWords('JEAN', 'JOHN')).toBe(false); // deux lettres sur un mot de 4
    expect(closeWords('NZAGO', 'NZAMO')).toBe(true);
  });

  const typed = (nom: string, prenom: string) => ({ nom, prenom });

  it('garde EXACT et PROBABLE quand les mots sont identiques', () => {
    expect(matchNames(typed('Kaba', 'Khloé'), typed('KABA', 'Khloe'))).toBe(
      'EXACT',
    );
    expect(
      matchNames(typed('Moukala', 'Alice'), typed('Moukala', 'Alice Marie')),
    ).toBe('PROBABLE');
  });

  it('signale une orthographe proche quand deux mots s’écrivent presque pareil', () => {
    expect(matchNames(typed('Kaba', 'Chloé'), typed('KABA', 'Khloé'))).toBe(
      'ORTHOGRAPHE',
    );
    expect(
      matchNames(
        typed('GALEBALI', 'Happy Dalech'),
        typed('NGALEBALY', 'Happy'),
      ),
    ).toBe('ORTHOGRAPHE');
    expect(
      matchNames(
        typed('Mayolas', 'Vasilia Bernadetta'),
        typed('MAYOLAS', 'Bernadette'),
      ),
    ).toBe('ORTHOGRAPHE');
  });

  it('ne rapproche pas sur un seul mot, même proche : un frère ou une sœur n’est pas le même enfant', () => {
    expect(
      matchNames(
        typed('Ndzelengue', 'Denis'),
        typed('NDZELENGUE', 'Kerney Denovane'),
      ),
    ).toBe('AUCUN');
    expect(matchNames(typed('Zola', 'Alice'), typed('Moukala', 'Alice'))).toBe(
      'AUCUN',
    );
  });

  it('un mot de l’élève ne sert qu’une fois', () => {
    // « Kaba Kaba » ne doit pas ressembler à « Kaba Khloé » par répétition du même mot.
    expect(matchNames(typed('Kaba', 'Kaba'), typed('KABA', 'Khloé'))).toBe(
      'AUCUN',
    );
  });
});
