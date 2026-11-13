BEGIN;

ALTER TABLE "Label" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Avoid deleting custom categories whose handling was not specified.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Label" l
    JOIN "LabelSchema" s ON s.id = l."schemaId"
    WHERE s.name = 'Automotive Entity Recognition'
      AND l.name NOT IN (
        'Vehicle', 'Component', 'Symptom', 'Repair Facility', 'Repair Status',
        'Manufacturer', 'Vehicle Model', 'Failure Mode', 'Vehicle Indicator', 'Other'
      )
  ) THEN
    RAISE EXCEPTION 'Automotive Entity Recognition contains custom categories; review them before applying this migration.';
  END IF;
END $$;

CREATE TEMPORARY TABLE "_affected_label_documents" ON COMMIT DROP AS
SELECT DISTINCT a."documentId"
FROM "Annotation" a
JOIN "Label" l ON l.id = a."labelId"
JOIN "LabelSchema" s ON s.id = l."schemaId"
WHERE s.name = 'Automotive Entity Recognition'
  AND l.name IN ('Manufacturer', 'Vehicle Model', 'Failure Mode', 'Vehicle Indicator', 'Other');

DELETE FROM "Annotation" a
USING "Label" l, "LabelSchema" s
WHERE a."labelId" = l.id AND l."schemaId" = s.id
  AND s.name = 'Automotive Entity Recognition'
  AND l.name IN ('Manufacturer', 'Vehicle Model', 'Failure Mode', 'Vehicle Indicator', 'Other');

UPDATE "Document" d
SET "labelingStatus" = 'UNLABELED', "updatedAt" = CURRENT_TIMESTAMP
WHERE d.id IN (SELECT "documentId" FROM "_affected_label_documents")
  AND NOT EXISTS (SELECT 1 FROM "Annotation" a WHERE a."documentId" = d.id);

DELETE FROM "Label" l
USING "LabelSchema" s
WHERE l."schemaId" = s.id
  AND s.name = 'Automotive Entity Recognition'
  AND l.name IN ('Manufacturer', 'Vehicle Model', 'Failure Mode', 'Vehicle Indicator', 'Other');

INSERT INTO "Label" ("id", "schemaId", "name", "description", "color", "sortOrder", "createdAt", "updatedAt")
SELECT 'label_' || md5(s.id || ':' || categories.name),
       s.id, categories.name, categories.description, categories.color, categories."sortOrder",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LabelSchema" s
CROSS JOIN (VALUES
  ('Vehicle', 'A vehicle or vehicle type.', '#168b82', 0),
  ('Component', 'Automotive parts and systems.', '#5273d1', 1),
  ('Symptom', 'A driver-observed symptom.', '#c24f62', 2),
  ('Repair Facility', 'A location or business where a vehicle is repaired.', '#b66b27', 3),
  ('Repair Status', 'The stated status or outcome of a repair.', '#7458bd', 4)
) AS categories(name, description, color, "sortOrder")
WHERE s.name = 'Automotive Entity Recognition'
ON CONFLICT ("schemaId", "name") DO UPDATE
SET "description" = EXCLUDED."description", "color" = EXCLUDED."color",
    "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
