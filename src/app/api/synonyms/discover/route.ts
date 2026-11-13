import { NextResponse } from "next/server";
import { discoverLlmSynonyms } from "@/lib/llm-synonyms";
import { errorResponse } from "@/lib/http";

export async function POST() {
  try {
    return NextResponse.json(await discoverLlmSynonyms());
  } catch (error) {
    return errorResponse(error);
  }
}
