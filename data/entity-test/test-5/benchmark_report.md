# Split component and failure-mode prompt experiment

Model: gemma4:e4b. Dataset: 30 complaints.

Prompt 6 (Component-only extraction (expanded recall)) extracts Components only; Prompt 5 (Failure-mode-only extraction) extracts Failure Modes only. The combined rows measure one pipeline that runs both prompts for every complaint.

## Results

| Experiment | Metric category | Precision | Recall | F1 | TP/FP/FN | Failed complaints | Model calls | Avg. model seconds/complaint | Wall runtime (seconds) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Prompt 6: Component-only extraction (expanded recall) | Component | 74.55% | 79.61% | 77.00% | 82/28/21 | 0 | 30 | 4.00 | 120.14 |
| Prompt 5: Failure-mode-only extraction | Failure Mode | 79.37% | 54.95% | 64.94% | 50/13/41 | 4 | 4 | 5.62 | 30.17 |
| Combined split-prompt pipeline (Prompts 5+6) | Overall | 76.30% | 68.04% | 71.93% | 132/41/62 | 4 | 34 | 9.62 | 150.31 |
| Combined split-prompt pipeline (Prompts 5+6) | Component | 74.55% | 79.61% | 77.00% | 82/28/21 | 4 | 34 | 9.62 | 150.31 |
| Combined split-prompt pipeline (Prompts 5+6) | Failure Mode | 79.37% | 54.95% | 64.94% | 50/13/41 | 4 | 34 | 9.62 | 150.31 |

## Evaluation and runtime notes

Metrics use the existing one-to-one, category-aware token Dice matcher at a 0.50 threshold within each complaint, micro-averaged across the dataset. Confidence does not filter predictions. Confidence-bearing JSON files retain each entity's score. An extraction failure returns no predictions for that complaint, so matching labels count as false negatives.

Average model time is the sum of recorded inference durations divided by the complaint count. Wall runtime measures each experiment's elapsed time in this run. Cached responses retain their original model inference duration; cache hits do not count as new model calls.
