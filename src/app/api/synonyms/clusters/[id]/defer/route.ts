import { NextRequest, NextResponse } from "next/server";
import { deferSynonymCluster } from "@/lib/synonyms";
import { errorResponse } from "@/lib/http";
import { synonymDecisionInput } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = synonymDecisionInput.parse(await request.json());
    return NextResponse.json({ cluster: await deferSynonymCluster({ clusterId: id, ...input }) });
  } catch (error) {
    return errorResponse(error);
  }
}
