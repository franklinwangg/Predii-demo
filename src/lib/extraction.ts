import { AnnotationCreatorType, AnnotationStatus, ExtractionRunStatus, LabelingStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { ENTITY_MODELS, extractModelEntities, modelPipelineKey } from "@/lib/llm";
import { createTermForAnnotation } from "@/lib/synonyms";
import { ENTITY_CONFIDENCE_THRESHOLD } from "@/lib/entity-confidence";
import { SCORING_BATCH_SIZE } from "@/lib/scoring-progress";

const LEASE_MS = 15 * 60 * 1000;

export async function selectScoringDocuments(datasetId: string, model: string) {
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { id: true } });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  if (!ENTITY_MODELS.some((name) => name === model)) throw new HttpError("Unknown extraction model.", 400);
  const key = modelPipelineKey(model);
  const documents = await prisma.document.findMany({
    where: {
      datasetId,
      NOT: { extractionRuns: { some: { pipelineKey: key, status: ExtractionRunStatus.COMPLETED } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: SCORING_BATCH_SIZE,
    select: { id: true },
  });
  return { documentIds: documents.map((document) => document.id) };
}

export async function runModelBatch(datasetId: string, model: string, limit: number, documentIds: string[], excludedDocumentIds: string[] = []) {
  if (!ENTITY_MODELS.some((name) => name === model)) throw new HttpError("Unknown extraction model.", 400);
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId }, include: { labelSchema: { include: { labels: true } } },
  });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  const key = modelPipelineKey(model);
  const documents = await prisma.document.findMany({
    where: {
      datasetId,
      id: { in: documentIds, notIn: excludedDocumentIds },
      NOT: { extractionRuns: { some: { OR: [
        { pipelineKey: key, status: ExtractionRunStatus.COMPLETED },
        { pipelineKey: key, status: ExtractionRunStatus.PROCESSING, startedAt: { gte: new Date(Date.now() - LEASE_MS) } },
      ] } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  const allCategories = dataset.labelSchema.labels.map((label) => label.name);
  const preferred = ["Component", "Vehicle", "Manufacturer", "Symptom", "Failure Mode"];
  const categories = preferred.every((category) => allCategories.includes(category)) ? preferred : allCategories;
  const results: Array<{ documentId: string; status: "completed" | "failed" | "busy"; error?: string; extracted?: number }> = [];
  for (const document of documents) {
    const run = await prisma.extractionRun.upsert({
      where: { documentId_pipelineKey: { documentId: document.id, pipelineKey: key } },
      create: { documentId: document.id, pipelineKey: key, model },
      update: {},
    });
    const startedAt = new Date();
    const claimed = await prisma.extractionRun.updateMany({
      where: { id: run.id, OR: [
        { status: { in: [ExtractionRunStatus.PENDING, ExtractionRunStatus.FAILED] } },
        { status: ExtractionRunStatus.PROCESSING, startedAt: { lt: new Date(Date.now() - LEASE_MS) } },
      ] },
      data: { status: ExtractionRunStatus.PROCESSING, startedAt, attempts: { increment: 1 }, lastError: null },
    });
    if (!claimed.count) {
      results.push({ documentId: document.id, status: "busy" });
      continue;
    }
    try {
      const entities = await extractModelEntities(document.originalText, categories, model);
      await prisma.$transaction(async (tx) => {
        await tx.annotation.deleteMany({
          where: {
            documentId: document.id,
            createdBy: model,
            createdByType: AnnotationCreatorType.AI,
            reviewDecisions: { none: {} },
          },
        });
        const lease = await tx.extractionRun.updateMany({
          where: { id: run.id, status: ExtractionRunStatus.PROCESSING, startedAt },
          data: {
            status: ExtractionRunStatus.COMPLETED,
            completedAt: new Date(),
            modelOutput: entities,
          },
        });
        if (!lease.count) throw new Error("Extraction lease expired; a newer attempt is running.");
        for (const entity of entities) {
          const label = dataset.labelSchema.labels.find((item) => item.name === entity.type);
          if (!label) throw new Error(`Unknown category: ${entity.type}`);
          const alreadyLabeled = await tx.annotation.findFirst({
            where: {
              documentId: document.id,
              startOffset: entity.start_offset,
              endOffset: entity.end_offset,
              labelId: label.id,
              OR: [
                { createdByType: AnnotationCreatorType.HUMAN },
                {
                  createdByType: AnnotationCreatorType.AI,
                  createdBy: model,
                  reviewDecisions: { some: {} },
                },
              ],
            },
            select: { id: true },
          });
          if (alreadyLabeled) continue;
          const term = await createTermForAnnotation(tx, label.id, entity.text);
          const confident = entity.confidence >= ENTITY_CONFIDENCE_THRESHOLD;
          await tx.annotation.create({
            data: {
              documentId: document.id,
              exactText: entity.text,
              startOffset: entity.start_offset,
              endOffset: entity.end_offset,
              labelId: label.id,
              createdBy: model,
              createdByType: AnnotationCreatorType.AI,
              status: confident ? AnnotationStatus.ACCEPTED : AnnotationStatus.PROPOSED,
              confidenceScore: entity.confidence,
              llmStatus: confident ? "resolved" : "needs_review",
              llmOutput: entity.originalOutput,
              extractionRunId: run.id,
              termId: term?.id ?? null,
              entityId: confident ? term?.alias?.entityId ?? null : null,
            },
          });
        }
        const pending = await tx.annotation.count({
          where: { documentId: document.id, status: AnnotationStatus.PROPOSED },
        });
        await tx.document.update({
          where: { id: document.id },
          data: {
            labelingStatus: pending > 0
              ? LabelingStatus.IN_PROGRESS
              : LabelingStatus.LABELED,
          },
        });
      }, { timeout: 30_000 });
      results.push({ documentId: document.id, status: "completed", extracted: entities.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown extraction error.";
      await prisma.extractionRun.updateMany({
        where: { id: run.id, status: ExtractionRunStatus.PROCESSING, startedAt },
        data: { status: ExtractionRunStatus.FAILED, lastError: message },
      });
      results.push({ documentId: document.id, status: "failed", error: message });
    }
  }
  return { results };
}

export async function pipelineStats(datasetId: string) {
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { labelSchemaId: true } });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  const modelKeys = ENTITY_MODELS.map(modelPipelineKey);
  const [complaints, processed, failed, extracted, canonical, pendingEntities, pendingSynonyms, resolvedSynonyms] =
    await Promise.all([
      prisma.document.count({ where: { datasetId } }),
      prisma.document.count({ where: {
        datasetId,
        extractionRuns: { some: { pipelineKey: { in: modelKeys }, status: "COMPLETED" } },
      } }),
      prisma.document.count({ where: {
        datasetId,
        extractionRuns: { some: { pipelineKey: { in: modelKeys }, status: "FAILED" } },
      } }),
      prisma.annotation.count({ where: { document: { datasetId }, createdByType: "AI" } }),
      prisma.automotiveEntity.count({ where: { label: { schemaId: dataset.labelSchemaId } } }),
      prisma.annotation.count({ where: { document: { datasetId }, status: "PROPOSED" } }),
      prisma.synonymCluster.count({ where: { label: { schemaId: dataset.labelSchemaId }, status: { in: ["PENDING", "DEFERRED"] } } }),
      prisma.synonymCluster.count({ where: { label: { schemaId: dataset.labelSchemaId }, status: "APPROVED" } }),
    ]);
  return { complaints, processed, failed, extracted, canonical, pendingEntities, pendingSynonyms, resolvedSynonyms };
}
