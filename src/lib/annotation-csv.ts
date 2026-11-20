import { phraseKey } from "@/lib/mention-groups";

type ExportAnnotation = {
  id: string;
  exactText: string;
  startOffset: number;
  endOffset: number;
  createdBy: string;
  createdByType: string;
  confidenceScore: number | null;
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
  "creator_type", "creator", "model_confidence_out_of_10", "annotation_id",
];

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function annotationsToCsv(annotations: ExportAnnotation[]): string {
  const rows = annotations.map((annotation) => {
    return [
      annotation.document.dataset.name, annotation.document.sourceId,
      annotation.document.vehicleMake, annotation.document.vehicleModel, annotation.document.vehicleYear,
      annotation.exactText, annotation.label.name, annotation.entity?.canonicalName ?? null,
      annotation.startOffset, annotation.endOffset, annotation.createdByType, annotation.createdBy,
      annotation.confidenceScore,
      annotation.id,
    ].map(csvCell).join(",");
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.length ? `${rows.join("\r\n")}\r\n` : ""}`;
}

export function entitiesToCsv(annotations: Array<Pick<ExportAnnotation, "exactText" | "label">>): string {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const annotation of annotations) {
    const key = JSON.stringify([phraseKey(annotation.exactText), phraseKey(annotation.label.name)]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(csvCell(`${annotation.exactText} : ${annotation.label.name}`));
  }
  return `\uFEFF${csvCell("entity : category")}\r\n${rows.length ? `${rows.join("\r\n")}\r\n` : ""}`;
}
