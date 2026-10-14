-- Paiement par banque : trois modes de paiement. Fichier à part : PostgreSQL interdit d'utiliser une valeur d'enum
-- dans la transaction qui l'ajoute (les paiements qui les portent ne naissent qu'après cette migration).

ALTER TYPE "PaymentMode" ADD VALUE 'VIREMENT';
ALTER TYPE "PaymentMode" ADD VALUE 'DEPOT_BANCAIRE';
ALTER TYPE "PaymentMode" ADD VALUE 'CHEQUE';
