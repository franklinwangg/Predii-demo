import { NextRequest, NextResponse } from "next/server";
import { createDataset, listDatasets } from "@/lib/data";
import { errorResponse } from "@/lib/http";
import { datasetInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ datasets: await listDatasets() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = datasetInput.parse(await request.json());
    const dataset = await createDataset(body);
    return NextResponse.json({ dataset }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
