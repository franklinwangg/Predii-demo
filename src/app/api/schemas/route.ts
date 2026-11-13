import { NextResponse } from "next/server";
import { listSchemas } from "@/lib/data";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ schemas: await listSchemas() });
  } catch (error) {
    return errorResponse(error);
  }
}
