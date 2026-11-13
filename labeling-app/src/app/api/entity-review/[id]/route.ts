import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewEntity } from "@/lib/entity-review";
import { errorResponse } from "@/lib/http";

const input = z.object({
  reviewer: z.string().trim().min(1).max(120),
  action: z.enum(["accept", "reject"]),
  exactText: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  labelId: z.string().min(1),
  occurrenceIds: z.array(z.string().min(1)).min(1).max(500).optional(),
  applyAllOccurrences: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await reviewEntity({ annotationId: id, ...input.parse(await request.json()) }));
  } catch (error) {
    return errorResponse(error);
  }
}
