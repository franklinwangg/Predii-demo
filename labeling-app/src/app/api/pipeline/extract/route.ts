import { NextResponse } from "next/server";
import { z } from "zod";
import { runExtractionBatch, runModelBatch } from "@/lib/extraction";
import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";
import { errorResponse } from "@/lib/http";

const input = z.object({
  datasetId: z.string().min(1),
  limit: z.number().int().min(1).max(25).default(5),
  skipFailed: z.boolean().default(false),
  excludedDocumentIds: z.array(z.string().min(1)).default([]),
  phase: z.union([z.enum(ENTITY_MODEL_NAMES), z.literal("compare")]),
});

export async function POST(request: Request) {
  try {
    const body = input.parse(await request.json());
    return NextResponse.json(body.phase === "compare"
      ? await runExtractionBatch(body.datasetId, body.limit, body.skipFailed, body.excludedDocumentIds)
      : await runModelBatch(body.datasetId, body.phase, body.limit, body.excludedDocumentIds));
  } catch (error) {
    return errorResponse(error);
  }
}
