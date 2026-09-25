-- Langue choisie par chaque utilisateur (« fr » ou « en »). Additive : vide = la langue de l'appareil s'applique.
ALTER TABLE "users" ADD COLUMN "langue" TEXT;
ALTER TABLE "parent_accounts" ADD COLUMN "langue" TEXT;
