import { ENTITY_MODEL_NAMES, isConfidentEntity } from "@/lib/entity-confidence";

export function ConfidenceScore({ total, scores }: {
  total: number | null;
  scores?: Record<string, number> | null;
}) {
  if (total === null) {
    return <div className="confidence-score confidence-unscored">Ensemble confidence: Not scored</div>;
  }
  return <div className={`confidence-score ${isConfidentEntity(total) ? "confidence-high" : "confidence-low"}`}>
    <strong>Ensemble confidence: {total}/30 · {isConfidentEntity(total) ? "High" : "Low"}</strong>
    {scores && <div className="model-score-list">
      {ENTITY_MODEL_NAMES.map((model) => <span key={model}>
        {model}: {scores[model] === 0 ? "No matching vote (0)" : typeof scores[model] === "number" ? `${scores[model]}/10` : "Unavailable"}
      </span>)}
    </div>}
  </div>;
}
