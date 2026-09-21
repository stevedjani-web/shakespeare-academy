import {
  classStats,
  generalAverage,
  letterFor,
  passed,
  rankAll,
  round2,
  subjectAverage,
} from './grade-calc.util';

describe('grade-calc.util', () => {
  describe('subjectAverage', () => {
    it('ramène chaque note sur 20 puis pondère par le coefficient de l’évaluation', () => {
      // 15/20 (coef 1) et 30/40 = 15/20 (coef 2) et 10/10 = 20/20 (coef 1) : (15 + 30 + 20) / 4 = 16,25
      const moyenne = subjectAverage([
        { coefficient: 1, bareme: 20, statut: 'NOTE', valeur: 15 },
        { coefficient: 2, bareme: 40, statut: 'NOTE', valeur: 30 },
        { coefficient: 1, bareme: 10, statut: 'NOTE', valeur: 10 },
      ]);
      expect(moyenne).toBe(16.25);
    });

    it('exclut un élève absent ou dispensé : sa note n’est jamais comptée 0', () => {
      const moyenne = subjectAverage([
        { coefficient: 1, bareme: 20, statut: 'NOTE', valeur: 14 },
        { coefficient: 1, bareme: 20, statut: 'ABSENT', valeur: null },
        { coefficient: 1, bareme: 20, statut: 'DISPENSE', valeur: null },
        { coefficient: 1, bareme: 20 }, // pas de ligne de note
      ]);
      expect(moyenne).toBe(14);
    });

    it('ne renvoie jamais 0 quand il n’y a aucune note : pas de moyenne', () => {
      expect(subjectAverage([])).toBeNull();
      expect(
        subjectAverage([
          { coefficient: 1, bareme: 20, statut: 'ABSENT', valeur: null },
        ]),
      ).toBeNull();
    });

    it('garde un vrai 0 : un zéro saisi est une note', () => {
      expect(
        subjectAverage([
          { coefficient: 1, bareme: 20, statut: 'NOTE', valeur: 0 },
        ]),
      ).toBe(0);
    });

    it('arrondit à 2 décimales', () => {
      // (10 + 11 + 11) / 3 = 10,666... -> 10,67
      expect(
        subjectAverage([
          { coefficient: 1, bareme: 20, statut: 'NOTE', valeur: 10 },
          { coefficient: 1, bareme: 20, statut: 'NOTE', valeur: 11 },
          { coefficient: 1, bareme: 20, statut: 'NOTE', valeur: 11 },
        ]),
      ).toBe(10.67);
    });
  });

  describe('generalAverage', () => {
    it('pondère par le coefficient de la matière et ignore les matières sans moyenne', () => {
      // (10 x 4 + 16 x 2 + 0 x 0) / 6 = 12 ; la matière sans moyenne n'entre pas dans le calcul.
      expect(
        generalAverage([
          { coefficient: 4, moyenne: 10 },
          { coefficient: 2, moyenne: 16 },
          { coefficient: 3, moyenne: null },
        ]),
      ).toBe(12);
    });

    it('renvoie null sans aucune moyenne de matière', () => {
      expect(generalAverage([{ coefficient: 2, moyenne: null }])).toBeNull();
      expect(generalAverage([])).toBeNull();
    });
  });

  describe('rankAll', () => {
    it('classe à la compétition : les ex æquo partagent le rang et le suivant saute', () => {
      const ranks = rankAll([
        { id: 'a', value: 15 },
        { id: 'b', value: 12 },
        { id: 'c', value: 15 },
        { id: 'd', value: 9 },
        { id: 'e', value: 12 },
      ]);
      expect(ranks.get('a')).toBe(1);
      expect(ranks.get('c')).toBe(1);
      expect(ranks.get('b')).toBe(3);
      expect(ranks.get('e')).toBe(3);
      expect(ranks.get('d')).toBe(5);
    });

    it('ne classe pas un élève sans moyenne', () => {
      const ranks = rankAll([
        { id: 'a', value: 8 },
        { id: 'b', value: null },
      ]);
      expect(ranks.get('a')).toBe(1);
      expect(ranks.get('b')).toBeNull();
    });
  });

  describe('classStats', () => {
    it('donne moyenne, minimum et maximum en ignorant les valeurs absentes', () => {
      expect(classStats([10, null, 14, 12])).toEqual({
        moyenne: 12,
        min: 10,
        max: 14,
      });
      expect(classStats([null])).toBeNull();
    });
  });

  describe('letterFor', () => {
    const bands = [
      { lettre: 'B', minimum: 14 },
      { lettre: 'A', minimum: 16 },
      { lettre: 'C', minimum: 12 },
    ];
    it('prend la tranche au plus grand minimum atteint', () => {
      expect(letterFor(17, bands)).toBe('A');
      expect(letterFor(16, bands)).toBe('A');
      expect(letterFor(15.99, bands)).toBe('B');
      expect(letterFor(12, bands)).toBe('C');
    });
    it('n’invente aucune lettre : sans tranche, ou sous la plus basse, ou sans moyenne', () => {
      expect(letterFor(17, [])).toBeNull();
      expect(letterFor(5, bands)).toBeNull();
      expect(letterFor(null, bands)).toBeNull();
    });
  });

  describe('passed', () => {
    it('n’invente aucune mention sans moyenne de passage', () => {
      expect(passed(12, null)).toBeNull();
      expect(passed(null, 10)).toBeNull();
      expect(passed(10, 10)).toBe(true);
      expect(passed(9.99, 10)).toBe(false);
    });
  });

  it('round2 arrondit sans l’erreur de flottant classique', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});
