import { NextRequest, NextResponse } from "next/server";
import { mergeSynonymCluster } from "@/lib/synonyms";
import { errorResponse } from "@/lib/http";
import { synonymMergeInput } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = synonymMergeInput.parse(await request.json());
    return NextResponse.json(await mergeSynonymCluster({ clusterId: id, ...input }));
  } catch (error) {
    return errorResponse(error);
  }
}
