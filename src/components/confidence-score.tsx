import { isConfidentEntity } from "@/lib/entity-confidence";

export function ConfidenceScore({ score, model }: {
  score: number | null;
  model: string;
}) {
  if (score === null || score < 1 || score > 10) {
    return <div className="confidence-score confidence-unscored">Model confidence: Not scored</div>;
  }
  return <div className={`confidence-score ${isConfidentEntity(score) ? "confidence-high" : "confidence-low"}`}>
    <strong>{model} confidence: {score}/10 · {isConfidentEntity(score) ? "High" : "Needs review"}</strong>
  </div>;
}
