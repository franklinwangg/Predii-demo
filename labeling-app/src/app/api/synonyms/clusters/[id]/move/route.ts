import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { moveSynonymTerms } from "@/lib/synonyms";

const input = z.object({
  targetClusterId: z.string().min(1),
  termIds: z.array(z.string().min(1)).min(1),
  reviewer: z.string().trim().min(1).max(120),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await moveSynonymTerms({ clusterId: id, ...input.parse(await request.json()) }));
  } catch (error) {
    return errorResponse(error);
  }
}
