-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LabelingStatus" AS ENUM ('UNLABELED', 'IN_PROGRESS', 'LABELED');

-- CreateEnum
CREATE TYPE "AnnotationCreatorType" AS ENUM ('HUMAN', 'AI');

-- CreateEnum
CREATE TYPE "AnnotationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleYear" INTEGER NOT NULL,
    "ingestionCursor" INTEGER NOT NULL DEFAULT 0,
    "ingestionMetadata" JSONB NOT NULL DEFAULT '{}',
    "labelSchemaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "sourcePayload" JSONB NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleYear" INTEGER NOT NULL,
    "labelingStatus" "LabelingStatus" NOT NULL DEFAULT 'UNLABELED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "exactText" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'local-labeler',
    "createdByType" "AnnotationCreatorType" NOT NULL DEFAULT 'HUMAN',
    "status" "AnnotationStatus" NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelSchema" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelSchema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5576d1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dataset_source_idx" ON "Dataset"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_name_vehicleMake_vehicleModel_vehicleYear_key" ON "Dataset"("name", "vehicleMake", "vehicleModel", "vehicleYear");

-- CreateIndex
CREATE INDEX "Document_datasetId_labelingStatus_idx" ON "Document"("datasetId", "labelingStatus");

-- CreateIndex
CREATE INDEX "Document_sourceId_idx" ON "Document"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_datasetId_sourceId_key" ON "Document"("datasetId", "sourceId");

-- CreateIndex
CREATE INDEX "Annotation_documentId_startOffset_endOffset_idx" ON "Annotation"("documentId", "startOffset", "endOffset");

-- CreateIndex
CREATE INDEX "Annotation_labelId_idx" ON "Annotation"("labelId");

-- CreateIndex
CREATE INDEX "Annotation_createdByType_status_idx" ON "Annotation"("createdByType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LabelSchema_name_key" ON "LabelSchema"("name");

-- CreateIndex
CREATE INDEX "Label_schemaId_idx" ON "Label"("schemaId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_schemaId_name_key" ON "Label"("schemaId", "name");

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_labelSchemaId_fkey" FOREIGN KEY ("labelSchemaId") REFERENCES "LabelSchema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "LabelSchema"("id") ON DELETE CASCADE ON UPDATE CASCADE;
