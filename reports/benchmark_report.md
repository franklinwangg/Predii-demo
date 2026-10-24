# Automotive Entity Extraction Benchmark Report

This report uses provisional LLM-generated reference labels (not verified ground truth).

## Overall Comparison

| Method | Strict P | Strict R | Strict F1 | Norm P | Norm R | Norm F1 | Runtime(s) | LLM Calls |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| direct_llm | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.03 | 12 |
| rules_nlp | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.35 | 0 |
| hybrid | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.06 | 12 |

## Per-Type Metrics

### direct_llm

| Entity Type | P | R | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| vehicle_make_model | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| component_part | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| vehicle_system | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| symptom | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| failure_mode | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| diagnostic_trouble_code | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| repair_maintenance_action | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| fluid_material | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| other_automotive_technical_concept | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |

### rules_nlp

| Entity Type | P | R | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| vehicle_make_model | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| component_part | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| vehicle_system | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| symptom | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| failure_mode | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| diagnostic_trouble_code | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| repair_maintenance_action | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| fluid_material | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| other_automotive_technical_concept | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |

### hybrid

| Entity Type | P | R | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| vehicle_make_model | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| component_part | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| vehicle_system | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| symptom | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| failure_mode | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| diagnostic_trouble_code | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| repair_maintenance_action | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| fluid_material | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |
| other_automotive_technical_concept | 0.000 | 0.000 | 0.000 | 0 | 0 | 0 |

## Error Analysis

Review queue contains disagreements and potential label gaps.

Review queue file: /Users/franklinwang/Desktop/3. Projects/9. Predii/data/reference/review_queue.jsonl
