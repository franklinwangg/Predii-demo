import { LabelingStatus } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { listDocuments } from "@/lib/data";
import { HttpError, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const datasetId = searchParams.get("datasetId");
    if (!datasetId) throw new HttpError("datasetId is required.", 400);

    const statusValue = searchParams.get("status");
    let status: LabelingStatus | undefined;
    if (statusValue && statusValue !== "ALL") {
      if (!Object.values(LabelingStatus).includes(statusValue as LabelingStatus)) {
        throw new HttpError("status must be LABELED, UNLABELED, or ALL.", 400);
      }
      status = statusValue as LabelingStatus;
    }

    const page = Number(searchParams.get("page") ?? "1");
    const limit = Number(searchParams.get("limit") ?? "100");
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new HttpError("page and limit must be positive integers; limit cannot exceed 500.", 400);
    }
    return NextResponse.json(await listDocuments({
      datasetId,
      status,
      query: searchParams.get("q")?.trim() || undefined,
      page,
      limit,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
