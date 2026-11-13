import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";

type ExportAnnotation = {
  id: string;
  exactText: string;
  startOffset: number;
  endOffset: number;
  createdBy: string;
  createdByType: string;
  confidenceTotal: number | null;
  modelConfidenceScores: unknown;
  label: { name: string };
  entity: { canonicalName: string } | null;
  document: {
    sourceId: string;
    dataset: { name: string };
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: number;
  };
};

const headers = [
  "dataset", "complaint_id", "vehicle_make", "vehicle_model", "vehicle_year",
  "entity_text", "category", "canonical_entity", "start_offset_utf16", "end_offset_utf16_exclusive",
  "creator_type", "creator", "confidence_total_out_of_30",
  ...ENTITY_MODEL_NAMES.map((name) => `${name}_vote_out_of_10`), "annotation_id",
];

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function annotationsToCsv(annotations: ExportAnnotation[]): string {
  const rows = annotations.map((annotation) => {
    const rawScores = annotation.modelConfidenceScores;
    const scores = rawScores && typeof rawScores === "object" && !Array.isArray(rawScores)
      ? rawScores as Record<string, unknown> : null;
    return [
      annotation.document.dataset.name, annotation.document.sourceId,
      annotation.document.vehicleMake, annotation.document.vehicleModel, annotation.document.vehicleYear,
      annotation.exactText, annotation.label.name, annotation.entity?.canonicalName ?? null,
      annotation.startOffset, annotation.endOffset, annotation.createdByType, annotation.createdBy,
      annotation.confidenceTotal,
      ...ENTITY_MODEL_NAMES.map((name) => {
        const score = scores?.[name];
        return typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 10 ? score : null;
      }),
      annotation.id,
    ].map(csvCell).join(",");
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.length ? `${rows.join("\r\n")}\r\n` : ""}`;
}
