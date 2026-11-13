CREATE TYPE "ExtractionRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "ExtractionRun" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "pipelineKey" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "ExtractionRunStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExtractionRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExtractionRun_documentId_pipelineKey_key" ON "ExtractionRun"("documentId", "pipelineKey");
CREATE INDEX "ExtractionRun_status_updatedAt_idx" ON "ExtractionRun"("status", "updatedAt");

ALTER TABLE "Annotation" ADD COLUMN "extractionRunId" TEXT, ADD COLUMN "llmStatus" TEXT, ADD COLUMN "llmOutput" JSONB;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "ExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Annotation_extractionRunId_idx" ON "Annotation"("extractionRunId");

ALTER TABLE "SynonymCluster"
  ADD COLUMN "llmStatus" TEXT,
  ADD COLUMN "llmExplanation" TEXT,
  ADD COLUMN "llmCanonicalName" TEXT,
  ADD COLUMN "llmModel" TEXT;

CREATE TABLE "ReviewDecision" (
  "id" TEXT NOT NULL,
  "annotationId" TEXT,
  "clusterId" TEXT,
  "reviewer" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewDecision_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReviewDecision_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "SynonymCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ReviewDecision_annotationId_createdAt_idx" ON "ReviewDecision"("annotationId", "createdAt");
CREATE INDEX "ReviewDecision_clusterId_createdAt_idx" ON "ReviewDecision"("clusterId", "createdAt");

CREATE TABLE "SynonymDiscoveryRun" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SynonymDiscoveryRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SynonymDiscoveryRun_fingerprint_key" ON "SynonymDiscoveryRun"("fingerprint");

INSERT INTO "Label" ("id", "schemaId", "name", "description", "color", "sortOrder", "createdAt", "updatedAt")
SELECT 'llm-label-' || md5(s.id || ':' || v.name), s.id, v.name, v.description, v.color, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LabelSchema" s
CROSS JOIN (VALUES
  ('Component', 'A vehicle component or system.', '#5273d1', 10),
  ('Manufacturer', 'A vehicle or component manufacturer.', '#527e45', 11),
  ('Symptom', 'An observed symptom or warning.', '#c24f62', 12),
  ('Failure Mode', 'A specific failure mechanism.', '#bd782a', 13)
) AS v(name, description, color, sort_order)
WHERE s.name = 'Automotive Entity Recognition'
ON CONFLICT ("schemaId", "name") DO NOTHING;
