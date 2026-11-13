import { AnnotationCreatorType, AnnotationStatus, ExtractionRunStatus, LabelingStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { ENTITY_MODELS, aggregateEntityExtractions, extractModelEntities, modelPipelineKey, pipelineKey, restoreModelEntities } from "@/lib/llm";
import { createTermForAnnotation } from "@/lib/synonyms";
import { ENTITY_CONFIDENCE_THRESHOLD } from "@/lib/entity-confidence";
import { SCORING_BATCH_SIZE } from "@/lib/scoring-progress";

const LEASE_MS = 15 * 60 * 1000;

export async function selectScoringDocuments(datasetId: string) {
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { id: true } });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  const documents = await prisma.document.findMany({
    where: {
      datasetId,
      NOT: { extractionRuns: { some: { pipelineKey: pipelineKey(), status: ExtractionRunStatus.COMPLETED } } },
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
        { pipelineKey: pipelineKey(), status: ExtractionRunStatus.COMPLETED },
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
  const results: Array<{ documentId: string; status: "completed" | "failed" | "busy"; error?: string }> = [];
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
      const updated = await prisma.extractionRun.updateMany({
        where: { id: run.id, status: ExtractionRunStatus.PROCESSING, startedAt },
        data: { status: ExtractionRunStatus.COMPLETED, completedAt: new Date(), modelOutput: entities },
      });
      if (!updated.count) throw new Error("Extraction lease expired; a newer attempt is running.");
      results.push({ documentId: document.id, status: "completed" });
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

export async function runExtractionBatch(datasetId: string, limit: number, documentIds: string[], skipFailed = false, excludedDocumentIds: string[] = []) {
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: { labelSchema: { include: { labels: true } } },
  });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  const key = pipelineKey();
  const model = ENTITY_MODELS.join(", ");
  const documents = await prisma.document.findMany({
    where: {
      datasetId,
      id: { in: documentIds, notIn: excludedDocumentIds },
      AND: ENTITY_MODELS.map((name) => ({
        extractionRuns: { some: { pipelineKey: modelPipelineKey(name), status: ExtractionRunStatus.COMPLETED } },
      })),
      NOT: {
        extractionRuns: {
          some: {
            pipelineKey: key,
            OR: [
              { status: ExtractionRunStatus.COMPLETED },
              { status: ExtractionRunStatus.PROCESSING, startedAt: { gte: new Date(Date.now() - LEASE_MS) } },
              ...(skipFailed ? [{ status: ExtractionRunStatus.FAILED }] : []),
            ],
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  const allCategories = dataset.labelSchema.labels.map((label) => label.name);
  const preferred = ["Component", "Vehicle", "Manufacturer", "Symptom", "Failure Mode"];
  const categories = preferred.every((category) => allCategories.includes(category))
    ? preferred
    : allCategories;
  const results: Array<{ documentId: string; status: "completed" | "failed" | "busy"; error?: string; extracted?: number }> = [];
  for (const document of documents) {
    const run = await prisma.extractionRun.upsert({
      where: { documentId_pipelineKey: { documentId: document.id, pipelineKey: key } },
      create: { documentId: document.id, pipelineKey: key, model },
      update: {},
    });
    const startedAt = new Date();
    const claimed = await prisma.extractionRun.updateMany({
      where: {
        id: run.id,
        OR: [
          { status: { in: [ExtractionRunStatus.PENDING, ExtractionRunStatus.FAILED] } },
          { status: ExtractionRunStatus.PROCESSING, startedAt: { lt: new Date(Date.now() - LEASE_MS) } },
        ],
      },
      data: {
        status: ExtractionRunStatus.PROCESSING,
        startedAt,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (!claimed.count) {
      results.push({ documentId: document.id, status: "busy" });
      continue;
    }
    try {
      const modelRuns = await prisma.extractionRun.findMany({
        where: { documentId: document.id, pipelineKey: { in: ENTITY_MODELS.map(modelPipelineKey) }, status: ExtractionRunStatus.COMPLETED },
      });
      const entities = aggregateEntityExtractions(ENTITY_MODELS.map((name) => {
        const modelRun = modelRuns.find((item) => item.pipelineKey === modelPipelineKey(name));
        if (!modelRun || modelRun.modelOutput === null) throw new Error(`Missing saved output for ${name}.`);
        return { model: name, entities: restoreModelEntities(modelRun.modelOutput, document.originalText, categories) };
      }));
      await prisma.$transaction(async (tx) => {
        const lease = await tx.extractionRun.updateMany({
          where: { id: run.id, status: ExtractionRunStatus.PROCESSING, startedAt },
          data: { status: ExtractionRunStatus.COMPLETED, completedAt: new Date() },
        });
        if (!lease.count) throw new Error("Extraction lease expired; a newer attempt is running.");
        for (const entity of entities) {
          const label = dataset.labelSchema.labels.find((item) => item.name === entity.type);
          if (!label) throw new Error(`Unknown category: ${entity.type}`);
          const term = await createTermForAnnotation(tx, label.id, entity.text);
          const existing = await tx.annotation.findFirst({
            where: {
              documentId: document.id,
              startOffset: entity.start_offset,
              endOffset: entity.end_offset,
              labelId: label.id,
            },
            select: {
              id: true,
              status: true,
              reviewDecisions: { select: { id: true }, take: 1 },
            },
          });
          if (existing) {
            const updateStatus = existing.status !== AnnotationStatus.REJECTED && existing.reviewDecisions.length === 0;
            await tx.annotation.updateMany({
              where: { id: existing.id, createdByType: AnnotationCreatorType.AI },
              data: {
                confidenceTotal: entity.confidenceTotal,
                modelConfidenceScores: entity.modelScores,
                llmOutput: entity.modelOutputs,
                llmStatus: entity.confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD ? "resolved" : "needs_review",
                extractionRunId: run.id,
                ...(updateStatus ? {
                  status: entity.confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD
                    ? AnnotationStatus.ACCEPTED
                    : AnnotationStatus.PROPOSED,
                  entityId: entity.confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD
                    ? term?.alias?.entityId ?? null
                    : null,
                } : {}),
              },
            });
            continue;
          }
          await tx.annotation.create({
            data: {
              documentId: document.id,
              exactText: entity.text,
              startOffset: entity.start_offset,
              endOffset: entity.end_offset,
              labelId: label.id,
              createdBy: model,
              createdByType: AnnotationCreatorType.AI,
              status: entity.confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD
                ? AnnotationStatus.ACCEPTED
                : AnnotationStatus.PROPOSED,
              confidenceTotal: entity.confidenceTotal,
              modelConfidenceScores: entity.modelScores,
              llmStatus: entity.confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD ? "resolved" : "needs_review",
              llmOutput: entity.modelOutputs,
              extractionRunId: run.id,
              termId: term?.id ?? null,
              entityId: entity.confidenceTotal >= ENTITY_CONFIDENCE_THRESHOLD
                ? term?.alias?.entityId ?? null
                : null,
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
  return {
    results,
    processed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    model,
  };
}

export async function pipelineStats(datasetId: string) {
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { labelSchemaId: true } });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  const [complaints, processed, failed, extracted, canonical, pendingEntities, pendingSynonyms, resolvedSynonyms] =
    await Promise.all([
      prisma.document.count({ where: { datasetId } }),
      prisma.extractionRun.count({ where: { document: { datasetId }, pipelineKey: pipelineKey(), status: "COMPLETED" } }),
      prisma.document.count({ where: {
        datasetId,
        extractionRuns: { some: { pipelineKey: { in: [pipelineKey(), ...ENTITY_MODELS.map(modelPipelineKey)] }, status: "FAILED" } },
        NOT: { extractionRuns: { some: { pipelineKey: pipelineKey(), status: "COMPLETED" } } },
      } }),
      prisma.annotation.count({ where: { document: { datasetId }, createdByType: "AI" } }),
      prisma.automotiveEntity.count({ where: { label: { schemaId: dataset.labelSchemaId } } }),
      prisma.annotation.count({ where: { document: { datasetId }, status: "PROPOSED" } }),
      prisma.synonymCluster.count({ where: { label: { schemaId: dataset.labelSchemaId }, status: { in: ["PENDING", "DEFERRED"] } } }),
      prisma.synonymCluster.count({ where: { label: { schemaId: dataset.labelSchemaId }, status: "APPROVED" } }),
    ]);
  return { complaints, processed, failed, extracted, canonical, pendingEntities, pendingSynonyms, resolvedSynonyms };
}
