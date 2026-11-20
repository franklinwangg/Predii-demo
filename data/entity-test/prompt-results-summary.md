# Entity extraction experiment results

## Test 1: Prompts 3 and 6 combined

Prompt 3's failure-mode exclusions and Prompt 6's expanded-recall component instructions were composed into one system prompt. Gemma 4 e4b processed all 30 complaints in one request per complaint. Results: [test-1](./test-1/).

Evaluation uses per-complaint one-to-one, category-aware token Dice matching at 0.50, micro-averaged. Confidence does not filter predictions.

| Category | Precision | Recall | F1 | TP/FP/FN |
|---|---:|---:|---:|---:|
| Overall | 71.96% | 39.69% | 51.16% | 77/30/117 |
| Component | 72.00% | 34.95% | 47.06% | 36/14/67 |
| Failure Mode | 71.93% | 45.05% | 55.41% | 41/16/50 |

There were 30 model calls, 253.10 seconds of inference time, and 5 extraction failures due to duplicate or invalid model output. Failed complaints were included in the evaluation with no predictions. Case-insensitive exact-span accuracy among fuzzy matches was 67.53%.

## Historical separate-prompt runs

These are results from separate category-only runs, not from Test 1's single combined-prompt request.

| Prompt | Category | Precision | Recall | F1 | TP/FP/FN | Failed complaints | Calls |
|---|---|---:|---:|---:|---:|---:|---:|
| 3: Failure-mode exclusions | Failure Mode | 80.26% | 67.03% | 73.05% | 61/15/30 | 1 | 31 |
| 6: Component-only (expanded recall) | Component | 74.55% | 79.61% | 77.00% | 82/28/21 | 0 | 30 |

The separate-run category metrics combined to 76.88% precision, 73.71% recall, and 75.26% F1 (143/43/51 TP/FP/FN). Test 1's joint prompt performed worse, especially on recall; its five failed extractions also contribute to the lower score.
