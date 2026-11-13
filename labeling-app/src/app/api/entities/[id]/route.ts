import { NextResponse } from "next/server";
import { getCanonicalEntity } from "@/lib/synonyms";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json({ entity: await getCanonicalEntity(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
