-- Lot 18 : mise en service des parents.
--
-- Un code d'activation remis dans une lettre distribuée par les élèves peut arriver plus d'une semaine après sa
-- génération : la validité par défaut passe de 7 à 30 jours. Aucun écran ne permettait de changer ce réglage
-- jusqu'ici ; la ligne existante n'est donc modifiée que si elle a encore la valeur d'origine (7), jamais une
-- valeur qu'un administrateur aurait posée depuis.
ALTER TABLE "schools" ALTER COLUMN "parentCodeValiditeJours" SET DEFAULT 30;

UPDATE "schools" SET "parentCodeValiditeJours" = 30 WHERE "parentCodeValiditeJours" = 7;
