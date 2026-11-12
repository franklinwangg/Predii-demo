import { NextResponse } from "next/server";
import { ingestNextComplaints } from "@/lib/data";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json(await ingestNextComplaints(id));
  } catch (error) {
    return errorResponse(error);
  }
}
