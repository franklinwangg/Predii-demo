# Combined entity extraction metrics

* Model: `gemma4:e4b`
* Prompts: 3 + 6 in one request per complaint
* Complaints: 30
* Calls: 30 (0 cache hits)
* Failures: 5
Runtime: 253.10 model seconds; 253.26 wall seconds

| Category | Precision | Recall | F1 | TP/FP/FN |
|---|---:|---:|---:|---:|
| Overall | 71.96% | 39.69% | 51.16% | 77/30/117 |
| Component | 72.00% | 34.95% | 47.06% | 36/14/67 |
| Failure Mode | 71.93% | 45.05% | 55.41% | 41/16/50 |

Exact-span accuracy among fuzzy matches (case-insensitive): 67.53%.
