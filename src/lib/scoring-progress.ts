import { ENTITY_MODEL_NAMES } from "@/lib/entity-confidence";

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
  request: (phase: ScoringPhase, excludedDocumentIds: string[]) => Promise<{ results: ScoringResult[] }>,
  onProgress: (phase: ScoringPhase, results: ScoringResult[]) => void,
): Promise<Array<{ phase: ScoringPhase; results: ScoringResult[] }>> {
  const phases: ScoringPhase[] = [...ENTITY_MODEL_NAMES, "compare"];
  const output: Array<{ phase: ScoringPhase; results: ScoringResult[] }> = [];
  for (const phase of phases) {
    onProgress(phase, []);
    const results = await runScoringQueue((excluded) => request(phase, excluded), (current) => onProgress(phase, current));
    output.push({ phase, results });
  }
  return output;
}
