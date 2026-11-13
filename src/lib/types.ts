export type Label = {
  id: string;
  name: string;
  description?: string;
  color: string;
};

export type Annotation = {
  id: string;
  documentId: string;
  exactText: string;
  startOffset: number;
  endOffset: number;
  labelId: string;
  createdBy: string;
  createdByType: "HUMAN" | "AI";
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
  confidenceTotal: number | null;
  modelConfidenceScores: Record<string, number> | null;
  knownEntity?: string | null;
  label: Label;
};

export type Dataset = {
  id: string;
  name: string;
  source: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  labelSchemaId: string;
  totalDocuments: number;
  labeledDocuments: number;
  unlabeledDocuments: number;
  annotationCount: number;
  labelSchema: { id: string; name: string };
};

export type DocumentSummary = {
  id: string;
  datasetId: string;
  sourceId: string;
  originalText: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  labelingStatus: "UNLABELED" | "IN_PROGRESS" | "LABELED";
  annotationCount: number;
};

export type DocumentDetail = DocumentSummary & {
  dataset: { id: string; name: string; labelSchemaId: string };
  annotations: Annotation[];
};

export type LabelSchema = {
  id: string;
  name: string;
  description: string;
  labels: Label[];
};
