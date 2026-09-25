-- Notifications aux parents en deux langues : version anglaise du titre et du détail (facultative, les
-- notifications existantes gardent leur texte français).
ALTER TABLE "parent_notifications" ADD COLUMN "titreEn" TEXT;
ALTER TABLE "parent_notifications" ADD COLUMN "corpsEn" TEXT;
