import { NextRequest, NextResponse } from "next/server";
import { deleteAnnotation, updateAnnotation } from "@/lib/data";
import { errorResponse } from "@/lib/http";
import { annotationPatchInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patch = annotationPatchInput.parse(await request.json());
    return NextResponse.json({ annotation: await updateAnnotation(id, patch) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteAnnotation(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
