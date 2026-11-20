export type LabeledEntity = { text: string; type: "Component" | "Failure Mode" };
export type EntityMetrics = {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
};

function tokens(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? []);
}

function tokenDiceSimilarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap++;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

export function getLabeledEntities(labels: {
  components: string[];
  failure_modes: string[];
}): LabeledEntity[] {
  return [
    ...labels.components.map((text) => ({ text, type: "Component" as const })),
    ...labels.failure_modes.map((text) => ({ text, type: "Failure Mode" as const })),
  ];
}

export function evaluateEntityPredictions(
  predictions: LabeledEntity[],
  groundTruth: LabeledEntity[],
): EntityMetrics {
  const candidates: Array<{ predictionIndex: number; goldIndex: number; similarity: number }> = [];
  for (let predictionIndex = 0; predictionIndex < predictions.length; predictionIndex++) {
    for (let goldIndex = 0; goldIndex < groundTruth.length; goldIndex++) {
      const prediction = predictions[predictionIndex];
      const gold = groundTruth[goldIndex];
      if (prediction.type !== gold.type) continue;
      const similarity = tokenDiceSimilarity(prediction.text, gold.text);
      if (similarity >= 0.5) candidates.push({ predictionIndex, goldIndex, similarity });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity ||
    a.predictionIndex - b.predictionIndex || a.goldIndex - b.goldIndex);
  const matchedPredictions = new Set<number>();
  const matchedGold = new Set<number>();
  for (const candidate of candidates) {
    if (matchedPredictions.has(candidate.predictionIndex) || matchedGold.has(candidate.goldIndex)) continue;
    matchedPredictions.add(candidate.predictionIndex);
    matchedGold.add(candidate.goldIndex);
  }
  const truePositives = matchedPredictions.size;
  const falsePositives = predictions.length - truePositives;
  const falseNegatives = groundTruth.length - matchedGold.size;
  const precision = truePositives / Math.max(1, predictions.length);
  const recall = truePositives / Math.max(1, groundTruth.length);
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    truePositives,
    falsePositives,
    falseNegatives,
  };
}
