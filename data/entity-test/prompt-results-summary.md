# Entity extraction prompt results

The active prompt is Prompt 3. Change ACTIVE_ENTITY_EXTRACTION_PROMPT_ID in ../../src/lib/prompts.ts to switch the app between numbered prompts.

## Prompt versions

### Prompt 1: Baseline

Original baseline prompt. Run folder: [test-1](./test-1/). Prompt 1 predates prompt snapshots; its original baseline wording is retained in the numbered registry.

### Prompt 2: Expanded automotive examples

Expanded automotive categories and examples. Run folder: [test-2](./test-2/). SHA-256: 519711a6f39b9844ca87d2dffe4d793a93ce7946c06b6ce8851ea462260bc1f8

### Prompt 3: Failure-mode exclusions

Prompt 2 plus exclusions for accident consequences, driver actions, health symptoms, and normal driving. Run folder: [test-3](./test-3/). SHA-256: 8d597871280ff3df478477f18e0357834dc835f2d9cbd37d862d662b8a0a4ec2

### Prompt 4: Component-only extraction

The supplied component-specific prompt. Run folder: [test-4](./test-4/). SHA-256: 8737288ef70290759003e10d6c1ad338d4b618a1fd85e0ac7fc7e270b752bc84

### Prompt 5: Failure-mode-only extraction

The supplied failure-mode-specific prompt. Run folder: [test-4](./test-4/). SHA-256: 69c88d1c61ce463cd2f9640b4d2d63602c727492e691aa79ded8fc7336dc8942

### Prompt 6: Component-only extraction (expanded recall)

Updated component-specific prompt with broader coverage of subcomponents, systems, abbreviations, and incidental mentions. Run folder: [test-5](./test-5/). SHA-256: 08eaaa44e9f4cb2f864542bed4d827e1f66005312ad290a51a59577abc1b337e

## Evaluation method

All runs use the same 30 complaints and ground truth in entity-labels.json. Metrics use one-to-one, category-aware token Dice matching at a 0.50 threshold within each complaint, then micro-averaging. Confidence does not filter predictions. A failed extraction contributes no predictions; its labels count as false negatives. Prompt 1 results are recalculated from archived model outputs against the current labels. Prompts 4 and 5 extract different categories independently; their combined row evaluates one pipeline running both prompts.

## Overall results

| Prompt | Version | Model | Precision | Recall | F1 | TP/FP/FN | Failed complaints | Model calls | Run |
|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | Baseline | qwen3.5:4b | 48.03% | 37.63% | 42.20% | 73/79/121 | 2 | 30 | [test-1](./test-1/) |
| 1 | Baseline | gemma4:e4b | 71.30% | 42.27% | 53.07% | 82/33/112 | 5 | 30 | [test-1](./test-1/) |
| 1 | Baseline | granite4:3b | 53.27% | 29.38% | 37.87% | 57/50/137 | 2 | 30 | [test-1](./test-1/) |
| 2 | Expanded automotive examples | gemma4:e4b | 73.44% | 48.45% | 58.39% | 94/34/100 | 2 | 32 | [test-2](./test-2/) |
| 3 | Failure-mode exclusions | gemma4:e4b | 81.30% | 51.55% | 63.09% | 100/23/94 | 1 | 31 | [test-3](./test-3/) |
| 4 | Component-only extraction | gemma4:e4b | N/A | N/A | N/A | N/A | 1 | 30 | [test-4](./test-4/) |
| 5 | Failure-mode-only extraction | gemma4:e4b | N/A | N/A | N/A | N/A | 4 | 30 | [test-4](./test-4/) |
| 4+5 | Combined split-prompt pipeline | gemma4:e4b | 75.74% | 65.98% | 70.52% | 128/41/66 | 4 | 60 | [test-4](./test-4/) |
| 6 | Component-only extraction (expanded recall) | gemma4:e4b | 74.55% | 79.61% | 77.00% | 82/28/21 | 0 | 30 | [test-5](./test-5/) |
| 5+6 | Combined split-prompt pipeline | gemma4:e4b | 76.30% | 68.04% | 71.93% | 132/41/62 | 4 | 34 (26 cached) | [test-5](./test-5/) |

## Component results

| Prompt | Version | Model | Precision | Recall | F1 | TP/FP/FN |
|---:|---|---|---:|---:|---:|---:|
| 1 | Baseline | qwen3.5:4b | 52.00% | 50.49% | 51.23% | 52/48/51 |
| 1 | Baseline | gemma4:e4b | 67.07% | 53.40% | 59.46% | 55/27/48 |
| 1 | Baseline | granite4:3b | 50.00% | 31.07% | 38.32% | 32/32/71 |
| 2 | Expanded automotive examples | gemma4:e4b | 83.67% | 39.81% | 53.95% | 41/8/62 |
| 3 | Failure-mode exclusions | gemma4:e4b | 82.98% | 37.86% | 52.00% | 39/8/64 |
| 4 | Component-only extraction | gemma4:e4b | 73.58% | 75.73% | 74.64% | 78/28/25 |
| 4+5 | Combined split-prompt pipeline | gemma4:e4b | 73.58% | 75.73% | 74.64% | 78/28/25 |
| 6 | Component-only extraction (expanded recall) | gemma4:e4b | 74.55% | 79.61% | 77.00% | 82/28/21 |
| 5+6 | Combined split-prompt pipeline | gemma4:e4b | 74.55% | 79.61% | 77.00% | 82/28/21 |

## Failure-mode results

| Prompt | Version | Model | Precision | Recall | F1 | TP/FP/FN |
|---:|---|---|---:|---:|---:|---:|
| 1 | Baseline | qwen3.5:4b | 40.38% | 23.08% | 29.37% | 21/31/70 |
| 1 | Baseline | gemma4:e4b | 81.82% | 29.67% | 43.55% | 27/6/64 |
| 1 | Baseline | granite4:3b | 58.14% | 27.47% | 37.31% | 25/18/66 |
| 2 | Expanded automotive examples | gemma4:e4b | 67.09% | 58.24% | 62.35% | 53/26/38 |
| 3 | Failure-mode exclusions | gemma4:e4b | 80.26% | 67.03% | 73.05% | 61/15/30 |
| 5 | Failure-mode-only extraction | gemma4:e4b | 79.37% | 54.95% | 64.94% | 50/13/41 |
| 4+5 | Combined split-prompt pipeline | gemma4:e4b | 79.37% | 54.95% | 64.94% | 50/13/41 |
| 5 | Failure-mode-only extraction | gemma4:e4b | 79.37% | 54.95% | 64.94% | 50/13/41 |
| 5+6 | Combined split-prompt pipeline | gemma4:e4b | 79.37% | 54.95% | 64.94% | 50/13/41 |

## Comparison notes

- Gemma's highest overall F1 is Prompt 3 at 63.09%, compared with 58.39% on Prompt 2 and 53.07% on Prompt 1.
- Prompt 3 failure-mode F1 is 73.05%, compared with 62.35% on Prompt 2; its component F1 is 52.00%, versus 53.95% on Prompt 2 and 59.46% on Prompt 1.
- The combined Prompt 4+5 pipeline reaches 70.52% overall F1, with component F1 74.64% and failure-mode F1 64.94%. It uses 60 calls and about 293 seconds of inference time, versus Prompt 3's 31 calls and about 237 seconds. Its higher overall F1 comes with higher model cost, and its failure-mode F1 is lower than Prompt 3's.
- Prompt 4 alone achieved 74.64% component F1 in 30 calls; Prompt 5 alone achieved 64.94% failure-mode F1 in 30 calls. The combined run recorded four failed extractions across four complaints; see [test-4 error analysis](./test-4/error_analysis.md).
- Prompt 6 raises component F1 to 77.00% and recall to 79.61%, with no component extraction failures. Paired with Prompt 5, overall F1 is 71.93%; the run made 34 new calls and reused 26 cached Prompt 5 responses. Confidence scores are preserved for every returned entity in the Prompt 6+5 confidence-bearing JSON files in [test-5](./test-5/).
- Prompt 1 was evaluated on all three models; Prompts 2 and 3 have Gemma runs only, so model comparisons are available only for Prompt 1.
