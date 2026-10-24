# Automotive Entity Extraction Benchmark (MVP)

This project implements an end-to-end, reproducible benchmark for automotive entity extraction on NHTSA complaint text.

It includes:
- Source collection/import from NHTSA complaint APIs
- Raw payload storage and HTML proxy snapshots
- Provisional LLM-generated reference labels
- Three extraction approaches:
  - Direct LLM extraction
  - Traditional NLP + rules (spaCy + dictionaries/patterns)
  - Hybrid (rule candidates + LLM candidate classification, optional discovery pass)
- Evaluation and benchmark reporting with disagreement review queues

## Project structure

- `src/auto_entity_benchmark/collector.py`: collection/import pipeline with caching, retries, fixed-seed sampling, dedup.
- `src/auto_entity_benchmark/reference_labeling.py`: provisional reference label generation using local LLM (Ollama).
- `src/auto_entity_benchmark/extractors/`
  - `direct_llm.py`
  - `rules_nlp.py`
  - `hybrid.py`
- `src/auto_entity_benchmark/evaluation.py`: strict + normalized metrics, per-type metrics, disagreement capture.
- `src/auto_entity_benchmark/reporting.py`: JSON metrics, Markdown report, review queue export.
- `src/auto_entity_benchmark/cli.py`: command line entry points.
- `config/entity_patterns.json`: editable dictionaries/rules.
- `data/`: raw/processed/reference/extractions/metrics artifacts.
- `reports/`: generated benchmark markdown reports.
- `tests/`: unit tests for schema/evaluation utilities.

## Setup

1. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install package and dependencies:

```bash
pip install -e .
```

3. (Recommended) Install spaCy model for better noun chunks:

```bash
python -m spacy download en_core_web_sm
```

4. Optional local LLM (Ollama) for reference labels / LLM approaches:

```bash
# install ollama from official docs, then pull one or more models
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:3b-instruct
```

If Ollama/models are unavailable, collection and rules-based extraction still run.

## Commands

### 1) Collect/import sample documents

```bash
auto-benchmark collect \
  --project-root . \
  --start-year 2010 \
  --end-year 2015 \
  --sample-size 80 \
  --sample-seed 42
```

Dry-run mode:

```bash
auto-benchmark collect --project-root . --dry-run
```

### 2) Generate provisional reference labels (LLM)

```bash
auto-benchmark label-reference \
  --project-root . \
  --ollama-url http://localhost:11434 \
  --model qwen2.5:7b-instruct
```

This stores model name, prompt version, raw responses, parsed labels, and parse errors.

### 3) Run benchmark (all 3 approaches)

```bash
auto-benchmark run-benchmark \
  --project-root . \
  --ollama-url http://localhost:11434 \
  --direct-model qwen2.5:3b-instruct \
  --hybrid-model qwen2.5:3b-instruct \
  --enable-discovery-pass
```

To evaluate against only reviewed reference labels:

```bash
auto-benchmark run-benchmark --project-root . --labels-reviewed-only
```

### 4) Run full pipeline in one command

```bash
auto-benchmark run-all \
  --project-root . \
  --start-year 2010 \
  --end-year 2015 \
  --sample-size 80 \
  --reference-model qwen2.5:7b-instruct \
  --direct-model qwen2.5:3b-instruct \
  --hybrid-model qwen2.5:3b-instruct
```

## Outputs

- Raw API payload cache: `data/raw/api/`
- HTML proxy snapshots: `data/raw/html_proxy/`
- Processed sample docs: `data/processed/documents.jsonl`
- Dev/eval split manifest: `data/processed/splits.json`
- Provisional reference labels: `data/reference/labels.jsonl`
- Review queue: `data/reference/review_queue.jsonl`
- Extraction outputs: `data/extractions/*.jsonl`
- Metrics JSON: `data/metrics/benchmark_metrics.json`
- Markdown report: `reports/benchmark_report.md`

## Notes on source format and access

- This MVP prioritizes official NHTSA API payloads for reproducible complaint text.
- Where direct complaint-page HTML is unavailable or access-restricted, the pipeline stores HTML proxy snapshots that wrap API JSON payloads.
- The difference is explicitly documented in collection output metadata.

## Evaluation policy

- Reference labels are **provisional LLM-generated labels** unless manually reviewed.
- Strict metrics (mention + type + offsets) and normalized metrics are both reported.
- Disagreements are exported for review instead of silently assuming all non-reference predictions are wrong.
- Dev/eval split is fixed by sample seed and stored in `data/processed/splits.json`.

## Tests

```bash
pytest -q
```

Current unit coverage includes:
- schema validation
- deduplication
- span matching
- core evaluation scoring

## Limitations (MVP)

- LLM token usage is logged as call counts; exact token accounting depends on model provider APIs.
- Cost estimation is omitted unless hosted APIs with pricing are added.
- spaCy extraction quality improves with `en_core_web_sm`; fallback blank pipeline works but is weaker.
- Reference labels are noisy until manually reviewed.
