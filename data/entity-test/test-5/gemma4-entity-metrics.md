# Prompt 6 Gemma test-5 metrics

Gemma 4 component-only run against 30 complaints. Metrics use one-to-one matching within each complaint, category-aware token Dice >= 0.50, micro-averaged. Confidence does not filter predictions.

Unresolved component extraction failures: 0.

## Components

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 103 | 110 | 74.55% | 79.61% | 77.00% | 82 | 28 | 21 |
