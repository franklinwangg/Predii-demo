ALTER TABLE "Annotation"
  ADD COLUMN "confidenceTotal" INTEGER,
  ADD COLUMN "modelConfidenceScores" JSONB;
