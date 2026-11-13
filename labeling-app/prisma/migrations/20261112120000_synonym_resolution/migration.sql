CREATE TYPE "SynonymClusterStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED');

CREATE TABLE "AutomotiveEntity" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "description" TEXT,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomotiveEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SynonymTerm" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "embedding" JSONB,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SynonymTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SynonymCluster" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "status" "SynonymClusterStatus" NOT NULL DEFAULT 'PENDING',
    "pendingKey" TEXT,
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedEntityId" TEXT,
    "resolvedEntityId" TEXT,
    "reviewer" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SynonymCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SynonymClusterMember" (
    "clusterId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SynonymClusterMember_pkey" PRIMARY KEY ("clusterId", "termId")
);

CREATE TABLE "RejectedSynonymPair" (
    "termAId" TEXT NOT NULL,
    "termBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RejectedSynonymPair_pkey" PRIMARY KEY ("termAId", "termBId")
);

ALTER TABLE "Annotation"
    ADD COLUMN "entityId" TEXT,
    ADD COLUMN "termId" TEXT;

CREATE UNIQUE INDEX "AutomotiveEntity_labelId_canonicalName_key" ON "AutomotiveEntity"("labelId", "canonicalName");
CREATE INDEX "AutomotiveEntity_canonicalName_idx" ON "AutomotiveEntity"("canonicalName");
CREATE UNIQUE INDEX "SynonymTerm_labelId_normalizedText_key" ON "SynonymTerm"("labelId", "normalizedText");
CREATE INDEX "SynonymTerm_labelId_idx" ON "SynonymTerm"("labelId");
CREATE UNIQUE INDEX "EntityAlias_termId_key" ON "EntityAlias"("termId");
CREATE INDEX "EntityAlias_entityId_idx" ON "EntityAlias"("entityId");
CREATE UNIQUE INDEX "SynonymCluster_pendingKey_key" ON "SynonymCluster"("pendingKey");
CREATE INDEX "SynonymCluster_status_priorityScore_idx" ON "SynonymCluster"("status", "priorityScore");
CREATE INDEX "SynonymCluster_labelId_status_idx" ON "SynonymCluster"("labelId", "status");
CREATE INDEX "SynonymClusterMember_termId_idx" ON "SynonymClusterMember"("termId");
CREATE INDEX "Annotation_entityId_idx" ON "Annotation"("entityId");
CREATE INDEX "Annotation_termId_idx" ON "Annotation"("termId");

ALTER TABLE "AutomotiveEntity" ADD CONSTRAINT "AutomotiveEntity_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SynonymTerm" ADD CONSTRAINT "SynonymTerm_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityAlias" ADD CONSTRAINT "EntityAlias_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "AutomotiveEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityAlias" ADD CONSTRAINT "EntityAlias_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SynonymTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SynonymCluster" ADD CONSTRAINT "SynonymCluster_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SynonymCluster" ADD CONSTRAINT "SynonymCluster_suggestedEntityId_fkey"
    FOREIGN KEY ("suggestedEntityId") REFERENCES "AutomotiveEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SynonymCluster" ADD CONSTRAINT "SynonymCluster_resolvedEntityId_fkey"
    FOREIGN KEY ("resolvedEntityId") REFERENCES "AutomotiveEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SynonymClusterMember" ADD CONSTRAINT "SynonymClusterMember_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "SynonymCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SynonymClusterMember" ADD CONSTRAINT "SynonymClusterMember_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SynonymTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RejectedSynonymPair" ADD CONSTRAINT "RejectedSynonymPair_termAId_fkey"
    FOREIGN KEY ("termAId") REFERENCES "SynonymTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RejectedSynonymPair" ADD CONSTRAINT "RejectedSynonymPair_termBId_fkey"
    FOREIGN KEY ("termBId") REFERENCES "SynonymTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "AutomotiveEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SynonymTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
