import { NextRequest, NextResponse } from "next/server";
import { pipelineStats } from "@/lib/extraction";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const datasetId = request.nextUrl.searchParams.get("datasetId");
    if (!datasetId) throw new HttpError("datasetId is required.", 400);
    return NextResponse.json(await pipelineStats(datasetId));
  } catch (error) {
    return errorResponse(error);
  }
}
