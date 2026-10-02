import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/** Plus petit PDF reconnu par le serveur (il lit les premiers octets, jamais le nom du fichier). */
export const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n',
);
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);

/** Demande de sortie avec un justificatif (PDF) ; `files: 0` pour tester le refus sans pièce. */
export function createExpense(
  app: INestApplication,
  token: string,
  body: Record<string, unknown>,
  options: { files?: number; idempotencyKey?: string } = {},
): request.Test {
  let req = request(app.getHttpServer())
    .post('/expenses')
    .set('Authorization', `Bearer ${token}`);
  if (options.idempotencyKey) {
    req = req.set('Idempotency-Key', options.idempotencyKey);
  }
  req = req.field('payload', JSON.stringify(body));
  for (let i = 0; i < (options.files ?? 1); i++) {
    req = req.attach('justificatif', PDF_BYTES, {
      filename: `devis-${i + 1}.pdf`,
      contentType: 'application/pdf',
    });
  }
  return req;
}
