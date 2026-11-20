# Prompts 5+6 Gemma test-5 metrics

Gemma 4 run against 30 complaints using the separate component and failure-mode prompts. Metrics use one-to-one matching within each complaint, category-aware token Dice >= 0.50, micro-averaged. Confidence does not filter predictions.

Unresolved extraction failures: 4 unique complaints (0 component failures and 4 failure-mode failures, with 0 overlapping). Failed category extractions contribute no predictions, so their ground-truth entities count as false negatives.

## Components

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 103 | 110 | 74.55% | 79.61% | 77.00% | 82 | 28 | 21 |

## Failure Modes

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 91 | 63 | 79.37% | 54.95% | 64.94% | 50 | 13 | 41 |

## Overall

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 194 | 173 | 76.30% | 68.04% | 71.93% | 132 | 41 | 62 |
