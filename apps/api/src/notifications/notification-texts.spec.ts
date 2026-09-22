import type { NotificationType } from '@prisma/client';
import {
  absenceBody,
  coalescePolicy,
  dePrenom,
  frenchDate,
  joinNames,
  mergedBody,
  notificationTitle,
  pushBody,
  retardBody,
} from './notification-texts';

const TYPES: NotificationType[] = [
  'ABSENCE',
  'RETARD',
  'ENSEIGNANT_ABSENT',
  'EMPLOI_DU_TEMPS_MODIFIE',
  'MESSAGE_RECU',
  'ANNONCE',
  'BULLETIN_DISPONIBLE',
  'DEVOIR_DONNE',
  'DISCIPLINE',
];

describe('textes des notifications', () => {
  it('élide devant une voyelle', () => {
    expect(dePrenom('Alice')).toBe("d'Alice");
    expect(dePrenom('Hélène')).toBe("d'Hélène");
    expect(dePrenom('Brice')).toBe('de Brice');
    expect(pushBody('EMPLOI_DU_TEMPS_MODIFIE', ['Alice'])).toContain(
      "classe d'Alice",
    );
    expect(pushBody('ENSEIGNANT_ABSENT', ['Brice'])).toContain(
      'classe de Brice',
    );
  });

  it('assemble les prénoms', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Alice'])).toBe('Alice');
    expect(joinNames(['Alice', 'Brice'])).toBe('Alice et Brice');
    expect(joinNames(['Alice', 'Brice', 'Carine'])).toBe(
      'Alice, Brice et Carine',
    );
    expect(joinNames(['Alice', 'Alice'])).toBe('Alice');
  });

  it('l’alerte push est générique : prénom et renvoi vers l’application, rien de sensible (RV10)', () => {
    for (const type of TYPES) {
      const body = pushBody(type, ['Alice']);
      expect(body).toContain('Alice');
      expect(body).toContain("Ouvrez l'application");
      expect(body).not.toMatch(/\d/); // ni heure, ni date, ni durée, ni montant
      expect(body).not.toMatch(/motif|note|FCFA|Maladie|justif/i);
      expect(body).not.toContain('—');
    }
  });

  it('les titres et les textes n’utilisent pas de tiret cadratin', () => {
    const s = {
      prenom: 'Alice',
      date: '2026-09-21',
      heureDebut: '08:00',
      heureFin: '08:50',
      matiere: 'Mathématiques',
    };
    const all = [
      ...TYPES.map(notificationTitle),
      absenceBody(s),
      retardBody(s, 10),
      ...TYPES.map((t) => mergedBody(t, 'Alice', 3, '2026-09-21')),
    ];
    for (const text of all) expect(text).not.toContain('—');
  });

  it('formate la date à la française et accorde le pluriel des minutes', () => {
    expect(frenchDate('2026-09-21')).toBe('21/09/2026');
    const s = {
      prenom: 'Alice',
      date: '2026-09-21',
      heureDebut: '08:00',
      heureFin: '08:50',
      matiere: 'Maths',
    };
    expect(retardBody(s, 1)).toContain('1 minute ');
    expect(retardBody(s, 5)).toContain('5 minutes');
    expect(retardBody(s, null)).not.toContain('minute');
  });

  it('regroupe par journée les événements immédiats, par fenêtre les changements d’emploi du temps (D71)', () => {
    expect(coalescePolicy('ABSENCE')).toBe('JOUR');
    expect(coalescePolicy('RETARD')).toBe('JOUR');
    expect(coalescePolicy('ENSEIGNANT_ABSENT')).toBe('JOUR');
    expect(coalescePolicy('EMPLOI_DU_TEMPS_MODIFIE')).toBe('FENETRE');
  });
});
