import { getPrismaClient } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { isValidTextSpan } from "@/lib/text-spans";
import { createTermForAnnotation } from "@/lib/synonyms";
import { Prisma } from "@/generated/prisma/client";
import { findPhraseOccurrences, phraseKey } from "@/lib/mention-groups";
import { normalizeTerm } from "@/lib/synonym-logic";

const reviewableAnnotations = {
  OR: [
    { status: "PROPOSED" as const },
    { status: "ACCEPTED" as const, confidenceScore: { gte: 9, lte: 10 } },
    {
      status: "ACCEPTED" as const,
      createdByType: "AI" as const,
      confidenceScore: null,
      reviewDecisions: { none: {} },
    },
  ],
};

export async function listEntityReviewDocuments(page: number) {
  const prisma = getPrismaClient();
  const where = { annotations: { some: reviewableAnnotations } };
  const [documents, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: page - 1,
      take: 1,
      include: {
        dataset: { include: { labelSchema: { include: { labels: { orderBy: { sortOrder: "asc" } } } } } },
        annotations: {
          where: reviewableAnnotations,
          include: { label: true, term: { include: { alias: { include: { entity: true } } } }, entity: true },
          orderBy: { startOffset: "asc" },
        },
      },
    }),
    prisma.document.count({ where }),
  ]);
  const document = documents[0];
  if (!document) return { document: null, page, total };
  const entities = await prisma.automotiveEntity.findMany({
    where: { label: { schemaId: document.dataset.labelSchemaId } },
    select: { labelId: true, canonicalName: true },
  });
  const names = new Map(entities.map((entity) => [`${entity.labelId}\0${normalizeTerm(entity.canonicalName)}`, entity.canonicalName]));
  return { document: {
    ...document,
    annotations: document.annotations.map((annotation) => ({
      ...annotation,
      knownEntity: annotation.entity?.canonicalName ?? annotation.term?.alias?.entity.canonicalName ??
        names.get(`${annotation.labelId}\0${normalizeTerm(annotation.exactText)}`) ?? null,
    })),
  }, page, total };
}

type EntityReviewInput = {
  annotationId: string;
  reviewer: string;
  action: "accept" | "reject";
  exactText: string;
  startOffset: number;
  endOffset: number;
  labelId: string;
  occurrenceIds?: string[];
  applyAllOccurrences?: boolean;
};

export async function reviewEntity(input: EntityReviewInput) {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const original = await tx.annotation.findUnique({
      where: { id: input.annotationId }, include: { document: true },
    });
    if (!original) throw new HttpError("Entity mention not found.", 404);
    if (input.applyAllOccurrences && (input.exactText !== original.exactText ||
      input.startOffset !== original.startOffset || input.endOffset !== original.endOffset)) {
      throw new HttpError("Text or offset corrections cannot be applied to all occurrences.", 400);
    }
    const result = await applyEntityReview(tx, input);
    if (input.applyAllOccurrences && input.action === "accept") {
      await acceptMissingOccurrences(tx, {
        documentId: original.documentId, originalText: original.document.originalText, phrase: original.exactText,
        labelId: input.labelId, reviewer: input.reviewer, sourceAnnotationId: original.id,
      });
    }
    return result;
  }, { timeout: 30_000 });
}

export async function acceptMissingOccurrences(tx: Prisma.TransactionClient, input: {
  documentId: string; originalText: string; phrase: string; labelId: string; reviewer: string; sourceAnnotationId: string;
}) {
  const spans = findPhraseOccurrences(input.originalText, input.phrase);
  const existing = await tx.annotation.findMany({
    where: { documentId: input.documentId, labelId: input.labelId },
    select: { startOffset: true, endOffset: true },
  });
  const occupied = new Set(existing.map((item) => `${item.startOffset}:${item.endOffset}`));
  for (const span of spans) {
    if (occupied.has(`${span.start}:${span.end}`)) continue;
    const term = await createTermForAnnotation(tx, input.labelId, span.text);
    const annotation = await tx.annotation.create({ data: {
      documentId: input.documentId, exactText: span.text, startOffset: span.start, endOffset: span.end,
      labelId: input.labelId, createdBy: input.reviewer, createdByType: "HUMAN", status: "ACCEPTED",
      termId: term?.id ?? null, entityId: term?.alias?.entityId ?? null,
    } });
    await tx.reviewDecision.create({ data: {
      annotationId: annotation.id, reviewer: input.reviewer, action: "ACCEPT",
      details: { sourceAnnotationId: input.sourceAnnotationId, reason: "Accepted repeated phrase" },
    } });
  }
}

export async function applyEntityReview(tx: Prisma.TransactionClient, input: EntityReviewInput) {
    const annotation = await tx.annotation.findUnique({
      where: { id: input.annotationId },
      include: { document: { include: { dataset: true } } },
    });
    if (!annotation) throw new HttpError("Entity mention not found.", 404);
    if (annotation.status !== "PROPOSED") throw new HttpError("This mention is no longer awaiting review.", 409);
    if (!isValidTextSpan(annotation.document.originalText, input.exactText, input.startOffset, input.endOffset)) {
      throw new HttpError("Corrected text must exactly match the complaint at the supplied offsets.", 400);
    }
    const label = await tx.label.findFirst({
      where: { id: input.labelId, schemaId: annotation.document.dataset.labelSchemaId },
    });
    if (!label) throw new HttpError("Category does not belong to the document schema.", 400);
    if (input.occurrenceIds && input.occurrenceIds.length > 1) {
      if (input.exactText !== annotation.exactText || input.startOffset !== annotation.startOffset || input.endOffset !== annotation.endOffset) {
        throw new HttpError("Text or offset corrections must be reviewed one occurrence at a time.", 400);
      }
      const ids = [...new Set(input.occurrenceIds)];
      if (!ids.includes(annotation.id)) throw new HttpError("The group must include the selected occurrence.", 400);
      const occurrences = await tx.annotation.findMany({ where: { id: { in: ids } } });
      if (occurrences.length !== ids.length || occurrences.some((item) =>
        item.documentId !== annotation.documentId || item.labelId !== annotation.labelId ||
        item.status !== "PROPOSED" || phraseKey(item.exactText) !== phraseKey(annotation.exactText))) {
        throw new HttpError("The occurrence group changed or includes an already reviewed label. Refresh and retry.", 409);
      }
      for (const item of occurrences) {
        await applyEntityReview(tx, {
          ...input, occurrenceIds: undefined, annotationId: item.id,
          exactText: item.exactText, startOffset: item.startOffset, endOffset: item.endOffset,
        });
      }
      return { id: annotation.id, status: input.action === "accept" ? "ACCEPTED" : "REJECTED", reviewed: occurrences.length };
    }
    const term = await createTermForAnnotation(tx, label.id, input.exactText);
    const changed = await tx.annotation.updateMany({
      where: { id: annotation.id, status: "PROPOSED" },
      data: {
        exactText: input.exactText,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        labelId: label.id,
        termId: term?.id ?? null,
        entityId: input.action === "accept" ? term?.alias?.entityId ?? null : null,
        status: input.action === "accept" ? "ACCEPTED" : "REJECTED",
        ...(input.exactText !== annotation.exactText || input.startOffset !== annotation.startOffset ||
          input.endOffset !== annotation.endOffset || input.labelId !== annotation.labelId
          ? { confidenceScore: null }
          : {}),
      },
    });
    if (!changed.count) throw new HttpError("This mention was already reviewed.", 409);
    await tx.reviewDecision.create({
      data: {
        annotationId: annotation.id,
        reviewer: input.reviewer,
        action: input.action.toUpperCase(),
        details: {
          original: {
            exactText: annotation.exactText,
            startOffset: annotation.startOffset,
            endOffset: annotation.endOffset,
            labelId: annotation.labelId,
            confidenceScore: annotation.confidenceScore,
          },
          corrected: {
            exactText: input.exactText,
            startOffset: input.startOffset,
            endOffset: input.endOffset,
            labelId: input.labelId,
          },
        },
      },
    });
    const pending = await tx.annotation.count({ where: { documentId: annotation.documentId, status: "PROPOSED" } });
    if (!pending) {
      await tx.document.update({ where: { id: annotation.documentId }, data: { labelingStatus: "LABELED" } });
    }
    return { id: annotation.id, status: input.action === "accept" ? "ACCEPTED" : "REJECTED" };
}
