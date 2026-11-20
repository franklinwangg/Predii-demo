# Component-only extraction benchmark

Prompt 6 (Component-only extraction, expanded recall), Gemma 4, 30 complaints. Precision 74.55%, recall 79.61%, F1 77.00% (82 TP, 28 FP, 21 FN). There were no failed complaints, and the run made 30 model calls. All returned entities are included regardless of confidence.

Metrics use one-to-one, category-aware token Dice matching at a 0.50 threshold within each complaint, micro-averaged. Confidence scores are preserved in component-extractions-with-confidence.json.
