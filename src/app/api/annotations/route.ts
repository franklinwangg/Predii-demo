import { NextRequest, NextResponse } from "next/server";
import { listAnnotationsByLabel, listUniqueAnnotationPhrases } from "@/lib/data";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const labelId = params.get("labelId");
    const page = Number(params.get("page") ?? "1");
    const limit = Number(params.get("limit") ?? "20");
    if (!labelId) throw new HttpError("labelId is required.", 400);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError("page and limit must be positive integers; limit cannot exceed 100.", 400);
    }
    if (!Number.isSafeInteger((page - 1) * limit)) throw new HttpError("page is too large.", 400);
    const unique = params.get("unique");
    if (unique !== null && unique !== "true" && unique !== "false") {
      throw new HttpError("unique must be true or false.", 400);
    }
    const list = unique === "true" ? listUniqueAnnotationPhrases : listAnnotationsByLabel;
    return NextResponse.json(await list({
      labelId,
      datasetId: params.get("datasetId") || undefined,
      page,
      limit,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
