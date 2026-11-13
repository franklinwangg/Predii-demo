BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Label" l
    JOIN "LabelSchema" s ON s.id = l."schemaId"
    WHERE s.name = 'Automotive Entity Recognition'
      AND l.name NOT IN (
        'Vehicle', 'Component', 'Vehicle System', 'Manufacturer', 'Symptom',
        'Failure Mode', 'Warning Indicator', 'Diagnostic/Repair Term', 'Organization',
        'Safety Event', 'Repair Facility', 'Repair Status'
      )
  ) THEN
    RAISE EXCEPTION 'Automotive Entity Recognition contains custom categories; review them before applying this migration.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Annotation" a
    JOIN "Label" l ON l.id = a."labelId"
    JOIN "LabelSchema" s ON s.id = l."schemaId"
    WHERE s.name = 'Automotive Entity Recognition' AND l.name = 'Repair Facility'
  ) THEN
    RAISE EXCEPTION 'Repair Facility contains annotations; decide how to migrate them before applying this migration.';
  END IF;
END $$;

CREATE TEMPORARY TABLE "_repair_status_documents" ON COMMIT DROP AS
SELECT DISTINCT a."documentId"
FROM "Annotation" a
JOIN "Label" l ON l.id = a."labelId"
JOIN "LabelSchema" s ON s.id = l."schemaId"
WHERE s.name = 'Automotive Entity Recognition' AND l.name = 'Repair Status';

DELETE FROM "Annotation" a
USING "Label" l, "LabelSchema" s
WHERE a."labelId" = l.id AND l."schemaId" = s.id
  AND s.name = 'Automotive Entity Recognition' AND l.name = 'Repair Status';

UPDATE "Document" d
SET "labelingStatus" = 'UNLABELED', "updatedAt" = CURRENT_TIMESTAMP
WHERE d.id IN (SELECT "documentId" FROM "_repair_status_documents")
  AND NOT EXISTS (SELECT 1 FROM "Annotation" a WHERE a."documentId" = d.id);

DELETE FROM "Label" l
USING "LabelSchema" s
WHERE l."schemaId" = s.id AND s.name = 'Automotive Entity Recognition'
  AND l.name IN ('Repair Facility', 'Repair Status');

INSERT INTO "Label" ("id", "schemaId", "name", "description", "color", "sortOrder", "createdAt", "updatedAt")
SELECT 'label_' || md5(s.id || ':' || categories.name),
       s.id, categories.name, categories.description, categories.color, categories."sortOrder",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LabelSchema" s
CROSS JOIN (VALUES
  ('Vehicle', 'A vehicle or vehicle type.', '#168b82', 0),
  ('Component', 'An individual automotive part or component.', '#5273d1', 1),
  ('Vehicle System', 'An automotive system made up of related components.', '#397eae', 2),
  ('Manufacturer', 'A company that manufactures vehicles or components.', '#8d56aa', 3),
  ('Symptom', 'A driver-observed symptom.', '#c24f62', 4),
  ('Failure Mode', 'The way a component or system fails.', '#ce6535', 5),
  ('Warning Indicator', 'A warning light, message, or other indicator.', '#b18818', 6),
  ('Diagnostic/Repair Term', 'A diagnostic finding, repair action, or repair status.', '#7458bd', 7),
  ('Organization', 'A dealership, repair facility, agency, or other organization.', '#527e45', 8),
  ('Safety Event', 'An event affecting safety, such as a crash or fire.', '#b03e79', 9)
) AS categories(name, description, color, "sortOrder")
WHERE s.name = 'Automotive Entity Recognition'
ON CONFLICT ("schemaId", "name") DO UPDATE
SET "description" = EXCLUDED."description", "color" = EXCLUDED."color",
    "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
