import { config } from 'dotenv';
import { resolve } from 'path';

// Chargé avant toute compilation de module Nest (setupFiles jest) : garantit que PrismaService
// se connecte à la base de test dédiée, jamais à la base de développement (voir README §7).
config({ path: resolve(__dirname, '../.env.test'), override: true });
