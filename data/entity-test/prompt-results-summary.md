# Selected entity extraction prompts

Only the selected prompts and their test results are retained:

- **Prompt 3 — Failure-mode exclusions:** used for the retained failure-mode results in [test-3](./test-3/). SHA-256: `8d597871280ff3df478477f18e0357834dc835f2d9cbd37d862d662b8a0a4ec2`.
- **Prompt 6 — Component-only extraction (expanded recall):** used for the retained component results in [test-5](./test-5/). SHA-256: `08eaaa44e9f4cb2f864542bed4d827e1f66005312ad290a51a59577abc1b337e`.

Both runs use the same 30 complaints and ground truth. Metrics use one-to-one, category-aware token Dice matching at a 0.50 threshold within each complaint, micro-averaged. Confidence does not filter predictions.

| Retained result | Model | Precision | Recall | F1 | TP/FP/FN | Failed complaints | Model calls |
|---|---|---:|---:|---:|---:|---:|---:|
| Prompt 3 — Failure Modes | gemma4:e4b | 80.26% | 67.03% | 73.05% | 61/15/30 | 1 | 31 |
| Prompt 6 — Components | gemma4:e4b | 74.55% | 79.61% | 77.00% | 82/28/21 | 0 | 30 |

Prompt 3 was originally evaluated for both categories; this summary retains only its Failure Mode metrics. Prompt 6 entities, including their confidence scores, are in `test-5/component-extractions-with-confidence.json`.
