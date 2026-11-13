import { NextRequest } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { annotationsToCsv, entitiesToCsv } from "@/lib/annotation-csv";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const datasetId = request.nextUrl.searchParams.get("datasetId");
    const format = request.nextUrl.searchParams.get("format") ?? "detailed";
    if (format !== "detailed" && format !== "entities") {
      throw new HttpError("Unknown CSV export format.", 400);
    }
    const prisma = getPrismaClient();
    if (datasetId && !await prisma.dataset.findUnique({ where: { id: datasetId }, select: { id: true } })) {
      throw new HttpError("Dataset not found.", 404);
    }
    const annotations = await prisma.annotation.findMany({
      where: { status: "ACCEPTED", ...(datasetId ? { document: { datasetId } } : {}) },
      include: {
        label: { select: { name: true } },
        entity: { select: { canonicalName: true } },
        document: { select: {
          sourceId: true, vehicleMake: true, vehicleModel: true, vehicleYear: true,
          dataset: { select: { name: true } },
        } },
      },
      orderBy: [{ documentId: "asc" }, { startOffset: "asc" }, { id: "asc" }],
    });
    return new Response(format === "entities" ? entitiesToCsv(annotations) : annotationsToCsv(annotations), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": format === "entities"
          ? 'attachment; filename="accepted-entities.csv"'
          : 'attachment; filename="accepted-entity-labels.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
