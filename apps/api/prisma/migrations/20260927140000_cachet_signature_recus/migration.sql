-- Cachet de l'établissement et signature des caissiers, posés automatiquement sur les reçus (fichiers privés).
ALTER TABLE "schools" ADD COLUMN "cachetFichier" TEXT;
ALTER TABLE "users" ADD COLUMN "signatureFichier" TEXT;
