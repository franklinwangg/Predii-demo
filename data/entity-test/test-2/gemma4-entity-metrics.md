# Gemma 4 test-2 entity metrics

Fresh run against 30 complaints using the current prompt in gemma4-extraction-prompt.txt. Evaluation uses the existing per-complaint, one-to-one, category-aware token Dice matcher at a 0.50 threshold; results are micro-averaged. Confidence does not filter predictions.

Extraction failures: 2 (11596913, 11608878). Failed complaints have no predictions, so their ground-truth entities count as false negatives.

## Components

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 103 | 49 | 83.67% | 39.81% | 53.95% | 41 | 8 | 62 |

## Failure Modes

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 91 | 79 | 67.09% | 58.24% | 62.35% | 53 | 26 | 38 |

## Overall

| Complaints | Ground truth | Predictions | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 194 | 128 | 73.44% | 48.45% | 58.39% | 94 | 34 | 100 |
