import { LabelingStatus, Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/lib/http";
import { getPrismaClient } from "@/lib/prisma";
import { isValidTextSpan } from "@/lib/text-spans";
import { createTermForAnnotation } from "@/lib/synonyms";
import { normalizeTerm } from "@/lib/synonym-logic";
import {
  complaintSourceId,
  complaintText,
  complaintVehicle,
  fetchComplaints,
  nextUnimportedComplaints,
} from "@/lib/nhtsa";
import type { z } from "zod";
import type {
  annotationBatchInput,
  annotationPatchInput,
  datasetInput,
} from "@/lib/validation";

type DatasetInput = z.infer<typeof datasetInput>;
type AnnotationBatch = z.infer<typeof annotationBatchInput>["annotations"];
type AnnotationPatch = z.infer<typeof annotationPatchInput>;

export async function listDatasets() {
  const prisma = getPrismaClient();
  const datasets = await prisma.dataset.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      labelSchema: { select: { id: true, name: true } },
      _count: { select: { documents: true } },
    },
  });

  return Promise.all(
    datasets.map(async ({ _count, ...dataset }) => {
      const [labeled, annotations] = await Promise.all([
        prisma.document.count({
          where: { datasetId: dataset.id, labelingStatus: LabelingStatus.LABELED },
        }),
        prisma.annotation.count({ where: { document: { datasetId: dataset.id } } }),
      ]);
      return {
        ...dataset,
        totalDocuments: _count.documents,
        labeledDocuments: labeled,
        unlabeledDocuments: _count.documents - labeled,
        annotationCount: annotations,
      };
    }),
  );
}

export async function createDataset(input: DatasetInput) {
  const prisma = getPrismaClient();
  const schema = input.labelSchemaId
    ? await prisma.labelSchema.findUnique({ where: { id: input.labelSchemaId } })
    : await prisma.labelSchema.findUnique({
        where: { name: "Automotive Entity Recognition" },
      });
  if (!schema) {
    throw new HttpError("No matching labeling schema found. Seed the database first.", 400);
  }

  return prisma.dataset.create({
    data: {
      name: input.name,
      source: input.source,
      vehicleMake: input.vehicleMake,
      vehicleModel: input.vehicleModel,
      vehicleYear: input.vehicleYear,
      labelSchemaId: schema.id,
    },
  });
}

export async function getDataset(datasetId: string) {
  const prisma = getPrismaClient();
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: {
      labelSchema: {
        include: { labels: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
      },
    },
  });
  if (!dataset) throw new HttpError("Dataset not found.", 404);
  return dataset;
}

export async function listDocuments(options: {
  datasetId: string;
  status?: LabelingStatus;
  query?: string;
  page: number;
  limit: number;
}) {
  const prisma = getPrismaClient();
  const where = {
    datasetId: options.datasetId,
    ...(options.status ? { labelingStatus: options.status } : {}),
    ...(options.query
      ? {
          OR: [
            { sourceId: { contains: options.query, mode: "insensitive" as const } },
            { originalText: { contains: options.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      include: {
        _count: { select: { annotations: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);
  return {
    documents: documents.map(({ _count, ...document }) => ({
      ...document,
      annotationCount: _count.annotations,
    })),
    total,
    page: options.page,
    limit: options.limit,
  };
}

export async function getDocument(documentId: string) {
  const prisma = getPrismaClient();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      dataset: { select: { id: true, name: true, labelSchemaId: true } },
      annotations: {
        orderBy: [{ startOffset: "asc" }, { createdAt: "asc" }],
        include: { label: { select: { id: true, name: true, color: true } },
          entity: { select: { canonicalName: true } },
          term: { select: { alias: { select: { entity: { select: { canonicalName: true } } } } } } },
      },
    },
  });
  if (!document) throw new HttpError("Document not found.", 404);

  const before = {
    datasetId: document.datasetId,
    OR: [
      { createdAt: { lt: document.createdAt } },
      { createdAt: document.createdAt, id: { lt: document.id } },
    ],
  };
  const after = {
    datasetId: document.datasetId,
    OR: [
      { createdAt: { gt: document.createdAt } },
      { createdAt: document.createdAt, id: { gt: document.id } },
    ],
  };
  const [documentsBefore, total, previous, next, entities] = await Promise.all([
    prisma.document.count({ where: before }),
    prisma.document.count({ where: { datasetId: document.datasetId } }),
    prisma.document.findFirst({
      where: before,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
    prisma.document.findFirst({
      where: after,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
    prisma.automotiveEntity.findMany({
      where: { label: { schemaId: document.dataset.labelSchemaId } },
      select: { labelId: true, canonicalName: true },
    }),
  ]);
  const names = new Map(entities.map((entity) => [`${entity.labelId}\0${normalizeTerm(entity.canonicalName)}`, entity.canonicalName]));
  return {
    document: { ...document, annotations: document.annotations.map((annotation) => ({
      ...annotation,
      knownEntity: annotation.entity?.canonicalName ?? annotation.term?.alias?.entity.canonicalName ??
        names.get(`${annotation.labelId}\0${normalizeTerm(annotation.exactText)}`) ?? null,
    })) },
    position: documentsBefore + 1,
    total,
    previousDocumentId: previous?.id ?? null,
    nextDocumentId: next?.id ?? null,
  };
}

export async function getDocumentAnnotations(documentId: string) {
  const prisma = getPrismaClient();
  const exists = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!exists) throw new HttpError("Document not found.", 404);
  return prisma.annotation.findMany({
    where: { documentId },
    orderBy: [{ startOffset: "asc" }, { createdAt: "asc" }],
    include: { label: { select: { id: true, name: true, color: true } } },
  });
}

export async function listAnnotationsByLabel(options: {
  labelId: string;
  datasetId?: string;
  page: number;
  limit: number;
}) {
  const prisma = getPrismaClient();
  const label = await prisma.label.findUnique({
    where: { id: options.labelId },
    select: { id: true },
  });
  if (!label) throw new HttpError("Category not found.", 404);
  if (options.datasetId) {
    const dataset = await prisma.dataset.findUnique({
      where: { id: options.datasetId },
      select: { id: true },
    });
    if (!dataset) throw new HttpError("Dataset not found.", 404);
  }
  const where: Prisma.AnnotationWhereInput = {
    labelId: options.labelId,
    ...(options.datasetId ? { document: { datasetId: options.datasetId } } : {}),
  };
  const [annotations, total] = await prisma.$transaction([
    prisma.annotation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
        exactText: true,
        startOffset: true,
        endOffset: true,
        createdBy: true,
        createdByType: true,
        status: true,
        confidenceTotal: true,
        modelConfidenceScores: true,
        document: {
          select: {
            id: true,
            sourceId: true,
            vehicleMake: true,
            vehicleModel: true,
            vehicleYear: true,
            dataset: { select: { name: true } },
          },
        },
      },
    }),
    prisma.annotation.count({ where }),
  ]);
  return { annotations, total, page: options.page, limit: options.limit };
}

export async function listUniqueAnnotationPhrases(options: {
  labelId: string;
  datasetId?: string;
  page: number;
  limit: number;
}) {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const label = await tx.label.findUnique({ where: { id: options.labelId }, select: { id: true } });
    if (!label) throw new HttpError("Category not found.", 404);
    if (options.datasetId) {
      const dataset = await tx.dataset.findUnique({ where: { id: options.datasetId }, select: { id: true } });
      if (!dataset) throw new HttpError("Dataset not found.", 404);
    }

    const datasetId = options.datasetId ?? null;
    const [counts, rows] = await Promise.all([
      tx.$queryRaw<{ total: number }[]>`
        SELECT COUNT(DISTINCT a."exactText")::int AS total
        FROM "Annotation" a
        JOIN "Document" d ON d.id = a."documentId"
        WHERE a."labelId" = ${options.labelId}
          AND (${datasetId}::text IS NULL OR d."datasetId" = ${datasetId})
      `,
      tx.$queryRaw<{
        id: string;
        exactText: string;
        startOffset: number;
        endOffset: number;
        createdBy: string;
        createdByType: "HUMAN" | "AI";
        status: "PROPOSED" | "ACCEPTED" | "REJECTED";
        confidenceTotal: number | null;
        modelConfidenceScores: Prisma.JsonValue;
        occurrenceCount: number;
        documentId: string;
        sourceId: string;
        vehicleMake: string;
        vehicleModel: string;
        vehicleYear: number;
        datasetName: string;
      }[]>`
        WITH ranked AS (
          SELECT a.*, COUNT(*) OVER (PARTITION BY a."exactText")::int AS "occurrenceCount",
            ROW_NUMBER() OVER (PARTITION BY a."exactText" ORDER BY a."createdAt" DESC, a.id DESC) AS rank
          FROM "Annotation" a
          JOIN "Document" d ON d.id = a."documentId"
          WHERE a."labelId" = ${options.labelId}
            AND (${datasetId}::text IS NULL OR d."datasetId" = ${datasetId})
        )
        SELECT r.id, r."exactText", r."startOffset", r."endOffset", r."createdBy",
          r."createdByType", r.status, r."confidenceTotal", r."modelConfidenceScores", r."occurrenceCount", d.id AS "documentId",
          d."sourceId", d."vehicleMake", d."vehicleModel", d."vehicleYear", ds.name AS "datasetName"
        FROM ranked r
        JOIN "Document" d ON d.id = r."documentId"
        JOIN "Dataset" ds ON ds.id = d."datasetId"
        WHERE r.rank = 1
        ORDER BY r."exactText" COLLATE "C"
        LIMIT ${options.limit} OFFSET ${(options.page - 1) * options.limit}
      `,
    ]);

    return {
      annotations: rows.map(({ documentId, sourceId, vehicleMake, vehicleModel, vehicleYear, datasetName, ...annotation }) => ({
        ...annotation,
        document: { id: documentId, sourceId, vehicleMake, vehicleModel, vehicleYear, dataset: { name: datasetName } },
      })),
      total: counts[0].total,
      page: options.page,
      limit: options.limit,
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function ingestNextComplaints(datasetId: string) {
  const dataset = await getDataset(datasetId);
  const prisma = getPrismaClient();
  if (dataset.source.toLowerCase() !== "nhtsa") {
    throw new HttpError("Ingestion is currently available only for NHTSA datasets.", 400);
  }
  const records = await fetchComplaints(
    dataset.vehicleMake,
    dataset.vehicleModel,
    dataset.vehicleYear,
  );
  const importedIds = new Set(
    (
      await prisma.document.findMany({
        where: { datasetId },
        select: { sourceId: true },
      })
    ).map(({ sourceId }) => sourceId),
  );

  const candidates = nextUnimportedComplaints(records, importedIds).flatMap((record) => {
    const sourceId = complaintSourceId(record);
    if (!sourceId) return [];
    const vehicle = complaintVehicle(record, {
      make: dataset.vehicleMake,
      model: dataset.vehicleModel,
      year: dataset.vehicleYear,
    });
    return [{
      datasetId,
      sourceId,
      originalText: complaintText(record),
      sourcePayload: JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue,
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      vehicleYear: vehicle.year,
    }];
  });

  const result = await prisma.$transaction(async (transaction) => {
    const inserted = await transaction.document.createMany({
      data: candidates,
      skipDuplicates: true,
    });
    await transaction.dataset.update({
      where: { id: datasetId },
      data: {
        ingestionCursor: { increment: inserted.count },
        ingestionMetadata: {
          lastIngestedAt: new Date().toISOString(),
          lastFetchedCount: records.length,
          lastImportedCount: inserted.count,
        },
      },
    });
    return inserted.count;
  });

  return {
    imported: result,
    skipped: records.length - result,
    availableFromSource: records.length,
    exhausted: result === 0,
    pagination: "The NHTSA endpoint returns the full result set without pagination; imports select the next 30 not-yet-stored complaint IDs.",
  };
}

export async function createAnnotations(
  documentId: string,
  annotations: AnnotationBatch,
) {
  const prisma = getPrismaClient();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      originalText: true,
      dataset: { select: { labelSchemaId: true } },
    },
  });
  if (!document) throw new HttpError("Document not found.", 404);

  const labelIds = [...new Set(annotations.map(({ labelId }) => labelId))];
  const labels = await prisma.label.findMany({
    where: {
      id: { in: labelIds },
      schemaId: document.dataset.labelSchemaId,
    },
    select: { id: true },
  });
  if (labels.length !== labelIds.length) {
    throw new HttpError("One or more labels do not belong to this dataset's schema.", 400);
  }
  for (const annotation of annotations) {
    const { startOffset, endOffset, exactText } = annotation;
    if (!isValidTextSpan(document.originalText, exactText, startOffset, endOffset)) {
      throw new HttpError("An annotation's text does not match its document offsets.", 400);
    }
  }

  return prisma.$transaction(async (transaction) => {
    const created = [];
    for (const annotation of annotations) {
      const term = await createTermForAnnotation(
        transaction,
        annotation.labelId,
        annotation.exactText,
      );
      created.push(
        await transaction.annotation.create({
          data: {
            documentId,
            ...annotation,
            termId: term?.id ?? null,
            entityId: term?.alias?.entityId ?? null,
            createdByType: annotation.createdByType,
            status: annotation.status,
          },
          include: { label: { select: { id: true, name: true, color: true } } },
        }),
      );
    }
    await transaction.document.update({
      where: { id: documentId },
      data: { labelingStatus: LabelingStatus.LABELED },
    });
    return created;
  });
}

export async function updateAnnotation(
  annotationId: string,
  patch: AnnotationPatch,
) {
  const prisma = getPrismaClient();
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: { document: { select: { id: true, dataset: { select: { labelSchemaId: true } } } } },
  });
  if (!annotation) throw new HttpError("Annotation not found.", 404);
  if (patch.labelId) {
    const label = await prisma.label.findFirst({
      where: {
        id: patch.labelId,
        schemaId: annotation.document.dataset.labelSchemaId,
      },
      select: { id: true },
    });
    if (!label) throw new HttpError("The selected label does not belong to this document's schema.", 400);
  }

  return prisma.$transaction(async (transaction) => {
    const term = patch.labelId
      ? await createTermForAnnotation(transaction, patch.labelId, annotation.exactText)
      : null;
    const updated = await transaction.annotation.update({
      where: { id: annotationId },
      data: {
        ...patch,
        ...(patch.labelId
          ? { termId: term?.id ?? null, entityId: term?.alias?.entityId ?? null }
          : {}),
        ...(patch.labelId && patch.labelId !== annotation.labelId
          ? { confidenceTotal: null, modelConfidenceScores: Prisma.DbNull }
          : {}),
      },
      include: { label: { select: { id: true, name: true, color: true } } },
    });
    await refreshDocumentStatus(transaction, annotation.documentId);
    return updated;
  });
}

export async function deleteAnnotation(annotationId: string) {
  const prisma = getPrismaClient();
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    select: { documentId: true },
  });
  if (!annotation) throw new HttpError("Annotation not found.", 404);

  await prisma.$transaction(async (transaction) => {
    await transaction.annotation.delete({ where: { id: annotationId } });
    await refreshDocumentStatus(transaction, annotation.documentId);
  });
}

async function refreshDocumentStatus(
  transaction: Prisma.TransactionClient,
  documentId: string,
) {
  const count = await transaction.annotation.count({ where: { documentId } });
  await transaction.document.update({
    where: { id: documentId },
    data: {
      labelingStatus: count > 0 ? LabelingStatus.LABELED : LabelingStatus.UNLABELED,
    },
  });
}

export async function listSchemas() {
  const prisma = getPrismaClient();
  return prisma.labelSchema.findMany({
    orderBy: { name: "asc" },
    include: { labels: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
}
