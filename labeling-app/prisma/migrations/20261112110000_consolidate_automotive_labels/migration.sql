BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Label" l
    JOIN "LabelSchema" s ON s.id = l."schemaId"
    WHERE s.name = 'Automotive Entity Recognition'
      AND l.name NOT IN (
        'Vehicle', 'Component', 'Vehicle System', 'Manufacturer', 'Symptom',
        'Failure Mode', 'Warning Indicator', 'Diagnostic/Repair Term', 'Diagnostic / Repair Term',
        'Organization', 'Safety Event', 'Automotive Part / System', 'Problem', 'Repair / Diagnosis'
      )
  ) THEN
    RAISE EXCEPTION 'Automotive Entity Recognition contains custom categories; review them before applying this migration.';
  END IF;
END $$;

INSERT INTO "Label" ("id", "schemaId", "name", "description", "color", "sortOrder", "createdAt", "updatedAt")
SELECT 'label_' || md5(s.id || ':' || categories.name),
       s.id, categories.name, categories.description, categories.color, categories."sortOrder",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LabelSchema" s
CROSS JOIN (VALUES
  ('Vehicle', 'A vehicle or vehicle type.', '#168b82', 0),
  ('Automotive Part / System', 'An automotive component, part, or system.', '#5273d1', 1),
  ('Organization', 'A manufacturer, dealership, repair facility, agency, or other organization.', '#527e45', 2),
  ('Problem', 'A symptom, failure mode, warning indicator, or safety event.', '#c24f62', 3),
  ('Repair / Diagnosis', 'A diagnostic finding, repair action, or repair status.', '#7458bd', 4)
) AS categories(name, description, color, "sortOrder")
WHERE s.name = 'Automotive Entity Recognition'
ON CONFLICT ("schemaId", "name") DO UPDATE
SET "description" = EXCLUDED."description", "color" = EXCLUDED."color",
    "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Annotation" a
SET "labelId" = target.id
FROM "Label" source
JOIN "LabelSchema" s ON s.id = source."schemaId"
JOIN (VALUES
  ('Component', 'Automotive Part / System'),
  ('Vehicle System', 'Automotive Part / System'),
  ('Manufacturer', 'Organization'),
  ('Symptom', 'Problem'),
  ('Failure Mode', 'Problem'),
  ('Warning Indicator', 'Problem'),
  ('Diagnostic/Repair Term', 'Repair / Diagnosis'),
  ('Diagnostic / Repair Term', 'Repair / Diagnosis'),
  ('Safety Event', 'Problem')
) AS mapping(old_name, new_name) ON mapping.old_name = source.name
JOIN "Label" target ON target."schemaId" = s.id AND target.name = mapping.new_name
WHERE a."labelId" = source.id AND s.name = 'Automotive Entity Recognition';

DELETE FROM "Label" l
USING "LabelSchema" s
WHERE l."schemaId" = s.id AND s.name = 'Automotive Entity Recognition'
  AND l.name IN (
    'Component', 'Vehicle System', 'Manufacturer', 'Symptom', 'Failure Mode',
    'Warning Indicator', 'Diagnostic/Repair Term', 'Diagnostic / Repair Term', 'Safety Event'
  );

COMMIT;
