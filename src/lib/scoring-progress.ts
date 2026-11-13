import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";

export const SCORING_BATCH_SIZE = 3;

export type ScoringResult = {
  documentId: string;
  status: "completed" | "failed" | "busy";
  error?: string;
};

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

export type ScoringPhase = typeof ENTITY_MODEL_NAMES[number] | "compare";

export async function runScoringPhases(
  documentIds: string[],
  request: (phase: ScoringPhase, documentIds: string[], excludedDocumentIds: string[]) => Promise<{ results: ScoringResult[] }>,
  onProgress: (phase: ScoringPhase, results: ScoringResult[]) => void,
): Promise<Array<{ phase: ScoringPhase; results: ScoringResult[] }>> {
  if (documentIds.length > SCORING_BATCH_SIZE || new Set(documentIds).size !== documentIds.length) {
    throw new Error("A scoring run must contain at most three distinct complaints.");
  }
  const selected = new Set(documentIds);
  const phases: ScoringPhase[] = [...ENTITY_MODEL_NAMES, "compare"];
  const output: Array<{ phase: ScoringPhase; results: ScoringResult[] }> = [];
  for (const phase of phases) {
    onProgress(phase, []);
    const results = documentIds.length === 0 ? [] : await runScoringQueue(async (excluded) => {
      const response = await request(phase, documentIds, excluded);
      if (response.results.some((result) => !selected.has(result.documentId))) {
        throw new Error("The scoring service returned a complaint outside this run.");
      }
      return response;
    }, (current) => onProgress(phase, current));
    output.push({ phase, results });
  }
  return output;
}
