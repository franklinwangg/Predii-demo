import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";

export const SCORING_BATCH_SIZE = 3;

export type ScoringResult = {
  documentId: string;
  status: "completed" | "failed" | "busy";
  error?: string;
};
export type ScoringModel = typeof ENTITY_MODEL_NAMES[number];

export async function runScoringQueue(
  request: (excludedDocumentIds: string[]) => Promise<{ results: ScoringResult[] }>,
  onProgress: (results: ScoringResult[]) => void,
): Promise<ScoringResult[]> {
  const results: ScoringResult[] = [];
  const seen = new Set<string>();
  while (true) {
    const response = await request([...seen]);
    if (response.results.length === 0) return results;
    for (const result of response.results) {
      if (seen.has(result.documentId)) {
        throw new Error("The scoring service returned a complaint more than once.");
      }
      seen.add(result.documentId);
      results.push(result);
    }
    onProgress([...results]);
  }
}

export async function runScoringModel(
  documentIds: string[],
  model: ScoringModel,
  request: (model: ScoringModel, documentIds: string[], excludedDocumentIds: string[]) => Promise<{ results: ScoringResult[] }>,
  onProgress: (results: ScoringResult[]) => void,
): Promise<ScoringResult[]> {
  if (documentIds.length > SCORING_BATCH_SIZE || new Set(documentIds).size !== documentIds.length) {
    throw new Error("A scoring run must contain at most three distinct complaints.");
  }
  const selected = new Set(documentIds);
  return documentIds.length === 0 ? [] : runScoringQueue(async (excluded) => {
    const response = await request(model, documentIds, excluded);
    if (response.results.some((result) => !selected.has(result.documentId))) {
      throw new Error("The scoring service returned a complaint outside this run.");
    }
    return response;
  }, onProgress);
}
