-- Priorité d'un message (normale, importante, urgente), choisie par l'expéditeur. Additive : les messages
-- existants restent « normale ».
CREATE TYPE "MessagePriority" AS ENUM ('NORMALE', 'IMPORTANTE', 'URGENTE');

ALTER TABLE "messages" ADD COLUMN "priorite" "MessagePriority" NOT NULL DEFAULT 'NORMALE';
