# Gemma 4 entity metrics

Evaluated the latest Gemma 4 re-extraction against `entity-labels.json` for all 30 complaints. Matching uses the existing one-to-one, category-aware token-Dice method with a 0.50 threshold.

Extraction failures: 2 (11396384, 11544891). Failed complaints have empty predictions and their ground-truth entities count as false negatives.

## Components

| Complaints | Ground-truth entities | Predicted entities | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 103 | 98 | 68.37% | 65.05% | 66.67% | 67 | 31 | 36 |

## Failure Modes

| Complaints | Ground-truth entities | Predicted entities | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 91 | 34 | 82.35% | 30.77% | 44.80% | 28 | 6 | 63 |

## Overall

| Complaints | Ground-truth entities | Predicted entities | Precision | Recall | F1 | TP | FP | FN |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 194 | 132 | 71.97% | 48.97% | 58.28% | 95 | 37 | 99 |

This report covers Gemma 4 only; Qwen and Granite prediction files are not present in the current `data/entity-test` directory.
