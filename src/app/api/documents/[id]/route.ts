import { NextResponse } from "next/server";
import { getDocument } from "@/lib/data";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json(await getDocument(id));
  } catch (error) {
    return errorResponse(error);
  }
}
