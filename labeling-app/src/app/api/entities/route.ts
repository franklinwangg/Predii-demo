import { NextRequest, NextResponse } from "next/server";
import { createCanonicalEntity, listCanonicalEntities } from "@/lib/synonyms";
import { errorResponse, HttpError } from "@/lib/http";
import { canonicalEntityInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page") ?? "1");
    const limit = Number(params.get("limit") ?? "20");
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError("page and limit must be positive integers; limit cannot exceed 100.", 400);
    }
    return NextResponse.json(await listCanonicalEntities({
      labelId: params.get("labelId") || undefined,
      query: params.get("q")?.trim() || undefined,
      page,
      limit,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = canonicalEntityInput.parse(await request.json());
    return NextResponse.json({ entity: await createCanonicalEntity(input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
