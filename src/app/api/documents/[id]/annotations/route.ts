import { NextRequest, NextResponse } from "next/server";
import { createAnnotations, getDocumentAnnotations } from "@/lib/data";
import { errorResponse } from "@/lib/http";
import { annotationBatchInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json({ annotations: await getDocumentAnnotations(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = annotationBatchInput.parse(await request.json());
    const annotations = await createAnnotations(id, body.annotations);
    return NextResponse.json({ annotations }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
