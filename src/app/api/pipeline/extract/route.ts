import { NextResponse } from "next/server";
import { z } from "zod";
import { runModelBatch, selectScoringDocuments } from "@/lib/extraction";
import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";
import { errorResponse } from "@/lib/http";
import { SCORING_BATCH_SIZE } from "@/lib/scoring-progress";

const input = z.discriminatedUnion("phase", [z.object({
  datasetId: z.string().min(1),
  model: z.enum(ENTITY_MODEL_NAMES),
  phase: z.literal("select"),
}), z.object({
  datasetId: z.string().min(1),
  phase: z.literal("run"),
  model: z.enum(ENTITY_MODEL_NAMES),
  limit: z.number().int().min(1).max(SCORING_BATCH_SIZE).default(1),
  documentIds: z.array(z.string().min(1)).min(1).max(SCORING_BATCH_SIZE)
    .refine((ids) => new Set(ids).size === ids.length, "Document IDs must be distinct."),
  excludedDocumentIds: z.array(z.string().min(1)).default([]),
})]);

export async function POST(request: Request) {
  try {
    const body = input.parse(await request.json());
    if (body.phase === "select") return NextResponse.json(await selectScoringDocuments(body.datasetId, body.model));
    return NextResponse.json(await runModelBatch(
      body.datasetId,
      body.model,
      body.limit,
      body.documentIds,
      body.excludedDocumentIds,
    ));
  } catch (error) {
    return errorResponse(error);
  }
}
