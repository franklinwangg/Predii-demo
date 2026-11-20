# Prompt 3 Gemma test-3 metrics

Fresh Gemma 4 run against 30 complaints using the prompt snapshot in gemma4-extraction-prompt-3.txt. Metrics use one-to-one matching within each complaint, category-aware token Dice >= 0.50, micro-averaged. Confidence does not filter predictions.

Unresolved extraction failures: 1 (11608878). Failed complaints have no predictions, so ground-truth entities count as false negatives.

## Components

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 103 | 47 | 82.98% | 37.86% | 52.00% | 39 | 8 | 64 |

## Failure Modes

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 91 | 76 | 80.26% | 67.03% | 73.05% | 61 | 15 | 30 |

## Overall

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 194 | 123 | 81.30% | 51.55% | 63.09% | 100 | 23 | 94 |
