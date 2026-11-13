import { NextRequest, NextResponse } from "next/server";
import { listEntityReviewDocuments } from "@/lib/entity-review";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1) throw new HttpError("page must be a positive integer.", 400);
    return NextResponse.json(await listEntityReviewDocuments(page));
  } catch (error) {
    return errorResponse(error);
  }
}
