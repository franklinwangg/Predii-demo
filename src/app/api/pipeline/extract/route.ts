import { NextResponse } from "next/server";
import { z } from "zod";
import { runExtractionBatch, runModelBatch, selectScoringDocuments } from "@/lib/extraction";
import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";
import { errorResponse } from "@/lib/http";
import { SCORING_BATCH_SIZE } from "@/lib/scoring-progress";

const input = z.discriminatedUnion("phase", [z.object({
  datasetId: z.string().min(1),
  phase: z.literal("select"),
}), z.object({
  datasetId: z.string().min(1),
  limit: z.number().int().min(1).max(SCORING_BATCH_SIZE).default(1),
  skipFailed: z.boolean().default(false),
  documentIds: z.array(z.string().min(1)).min(1).max(SCORING_BATCH_SIZE)
    .refine((ids) => new Set(ids).size === ids.length, "Document IDs must be distinct."),
  excludedDocumentIds: z.array(z.string().min(1)).default([]),
  phase: z.union([z.enum(ENTITY_MODEL_NAMES), z.literal("compare")]),
})]);

export async function POST(request: Request) {
  try {
    const body = input.parse(await request.json());
    if (body.phase === "select") return NextResponse.json(await selectScoringDocuments(body.datasetId));
    return NextResponse.json(body.phase === "compare"
      ? await runExtractionBatch(body.datasetId, body.limit, body.documentIds, body.skipFailed, body.excludedDocumentIds)
      : await runModelBatch(body.datasetId, body.phase, body.limit, body.documentIds, body.excludedDocumentIds));
  } catch (error) {
    return errorResponse(error);
  }
}
