# Split component and failure-mode prompt experiment

Model: gemma4:e4b. Dataset: 30 complaints.

Prompt 4 extracts Components only; Prompt 5 extracts Failure Modes only. The combined rows measure one pipeline that runs both prompts for every complaint.

## Results

| Experiment | Metric category | Precision | Recall | F1 | TP/FP/FN | Failed complaints | Model calls | Avg. model seconds/complaint | Wall runtime (seconds) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Prompt 4: Component-only extraction | Component | 73.58% | 75.73% | 74.64% | 78/28/25 | 1 | 30 | 4.10 | 123.09 |
| Prompt 5: Failure-mode-only extraction | Failure Mode | 79.37% | 54.95% | 64.94% | 50/13/41 | 4 | 30 | 5.66 | 169.87 |
| Combined split-prompt pipeline (Prompts 4+5) | Overall | 75.74% | 65.98% | 70.52% | 128/41/66 | 4 | 60 | 9.76 | 292.96 |
| Combined split-prompt pipeline (Prompts 4+5) | Component | 73.58% | 75.73% | 74.64% | 78/28/25 | 4 | 60 | 9.76 | 292.96 |
| Combined split-prompt pipeline (Prompts 4+5) | Failure Mode | 79.37% | 54.95% | 64.94% | 50/13/41 | 4 | 60 | 9.76 | 292.96 |

## Evaluation and runtime notes

Metrics use the existing one-to-one, category-aware token Dice matcher at a 0.50 threshold within each complaint, micro-averaged across the dataset. Confidence does not filter predictions. An extraction failure returns no predictions for that complaint, so matching labels count as false negatives.

Average model time is the sum of recorded inference durations divided by the complaint count. Wall runtime measures each experiment's elapsed time in this run. Cached responses retain their original model inference duration; cache hits do not count as new model calls.
