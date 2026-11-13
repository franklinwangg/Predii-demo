import { NextRequest, NextResponse } from "next/server";
import { listSynonymClusters } from "@/lib/synonyms";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page") ?? "1");
    const limit = Number(params.get("limit") ?? "20");
    const status = params.get("status") ?? "PENDING";
    if (!["PENDING", "DEFERRED", "APPROVED", "REJECTED"].includes(status)) {
      throw new HttpError("status must be PENDING, DEFERRED, APPROVED, or REJECTED.", 400);
    }
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError("page and limit must be positive integers; limit cannot exceed 100.", 400);
    }
    if (!Number.isSafeInteger((page - 1) * limit)) throw new HttpError("page is too large.", 400);
    return NextResponse.json(await listSynonymClusters({
      status: status as "PENDING" | "DEFERRED" | "APPROVED" | "REJECTED",
      page,
      limit,
      labelId: params.get("labelId") || undefined,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
