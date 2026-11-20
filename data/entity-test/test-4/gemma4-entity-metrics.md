# Prompt 4+5 Gemma test-4 metrics

Fresh Gemma 4 run against 30 complaints using the separate component and failure-mode prompts. Metrics use one-to-one matching within each complaint, category-aware token Dice >= 0.50, micro-averaged. Confidence does not filter predictions.

Unresolved extraction failures: 4 unique complaints (1 component extraction and 4 failure-mode extractions, with one complaint overlapping). Failed category extractions contribute no predictions, so their ground-truth entities count as false negatives. The combined run made 60 model calls and took 292.96 seconds.

## Components

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 103 | 106 | 73.58% | 75.73% | 74.64% | 78 | 28 | 25 |

## Failure Modes

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 91 | 63 | 79.37% | 54.95% | 64.94% | 50 | 13 | 41 |

## Overall

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 194 | 169 | 75.74% | 65.98% | 70.52% | 128 | 41 | 66 |
