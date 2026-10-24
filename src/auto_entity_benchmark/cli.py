from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from .collector import collect_or_import_documents
from .config import PipelineConfig, project_paths
from .evaluation import evaluate_method, timed_call
from .extractors.direct_llm import extract as direct_extract
from .extractors.hybrid import extract as hybrid_extract
from .extractors.rules_nlp import extract as rules_extract
from .io_utils import read_json, read_jsonl, write_jsonl
from .llm_client import list_ollama_models
from .reference_labeling import build_reference_labels
from .reporting import write_reports


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Automotive entity extraction benchmark")
    sub = parser.add_subparsers(dest="cmd", required=True)

    collect = sub.add_parser("collect", help="Collect/import sample complaint documents")
    collect.add_argument("--project-root", default=".")
    collect.add_argument("--start-year", type=int, default=2010)
    collect.add_argument("--end-year", type=int, default=2015)
    collect.add_argument("--sample-size", type=int, default=80)
    collect.add_argument("--sample-seed", type=int, default=42)
    collect.add_argument("--dev-ratio", type=float, default=0.5)
    collect.add_argument("--dry-run", action="store_true")

    ref = sub.add_parser("label-reference", help="Generate provisional LLM reference labels")
    ref.add_argument("--project-root", default=".")
    ref.add_argument("--ollama-url", default="http://localhost:11434")
    ref.add_argument("--model", default="qwen2.5:7b-instruct")
    ref.add_argument("--max-llm-retries", type=int, default=2)

    run = sub.add_parser("run-benchmark", help="Run extraction approaches + evaluation")
    run.add_argument("--project-root", default=".")
    run.add_argument("--ollama-url", default="http://localhost:11434")
    run.add_argument("--direct-model", default="qwen2.5:3b-instruct")
    run.add_argument("--hybrid-model", default="qwen2.5:3b-instruct")
    run.add_argument("--max-llm-retries", type=int, default=2)
    run.add_argument("--enable-discovery-pass", action="store_true")
    run.add_argument("--labels-reviewed-only", action="store_true")

    full = sub.add_parser("run-all", help="Run collect + reference labels + benchmark")
    full.add_argument("--project-root", default=".")
    full.add_argument("--start-year", type=int, default=2010)
    full.add_argument("--end-year", type=int, default=2015)
    full.add_argument("--sample-size", type=int, default=80)
    full.add_argument("--sample-seed", type=int, default=42)
    full.add_argument("--dev-ratio", type=float, default=0.5)
    full.add_argument("--ollama-url", default="http://localhost:11434")
    full.add_argument("--reference-model", default="qwen2.5:7b-instruct")
    full.add_argument("--direct-model", default="qwen2.5:3b-instruct")
    full.add_argument("--hybrid-model", default="qwen2.5:3b-instruct")
    full.add_argument("--max-llm-retries", type=int, default=2)
    full.add_argument("--enable-discovery-pass", action="store_true")
    full.add_argument("--dry-run", action="store_true")

    return parser.parse_args()


def _cfg_from_args(args: argparse.Namespace) -> PipelineConfig:
    return PipelineConfig(
        start_year=getattr(args, "start_year", 2010),
        end_year=getattr(args, "end_year", 2015),
        sample_size=getattr(args, "sample_size", 80),
        sample_seed=getattr(args, "sample_seed", 42),
        dev_ratio=getattr(args, "dev_ratio", 0.5),
        ollama_url=getattr(args, "ollama_url", "http://localhost:11434"),
        reference_model=getattr(args, "reference_model", getattr(args, "model", "qwen2.5:7b-instruct")),
        direct_model=getattr(args, "direct_model", "qwen2.5:3b-instruct"),
        hybrid_model=getattr(args, "hybrid_model", "qwen2.5:3b-instruct"),
        max_llm_retries=getattr(args, "max_llm_retries", 2),
        dry_run=getattr(args, "dry_run", False),
    )


def _load_docs(paths: dict[str, Path]) -> list[dict[str, Any]]:
    return read_jsonl(paths["processed_docs"])


def _load_reference(paths: dict[str, Path]) -> list[dict[str, Any]]:
    return read_jsonl(paths["reference_labels"])


def _run_collect(cfg: PipelineConfig, paths: dict[str, Path]) -> dict[str, Any]:
    return collect_or_import_documents(
        cfg=cfg,
        raw_api_dir=paths["raw_api"],
        raw_html_dir=paths["raw_html"],
        processed_docs_path=paths["processed_docs"],
        splits_path=paths["splits"],
    )


def _run_reference(cfg: PipelineConfig, paths: dict[str, Path]) -> dict[str, Any]:
    docs = _load_docs(paths)
    return build_reference_labels(
        docs=docs,
        ollama_url=cfg.ollama_url,
        model=cfg.reference_model,
        out_path=paths["reference_labels"],
        logs_path=paths["extractions"] / "reference_labeling_logs.jsonl",
        max_llm_retries=cfg.max_llm_retries,
    )


def _run_benchmark(
    cfg: PipelineConfig,
    paths: dict[str, Path],
    enable_discovery_pass: bool,
    labels_reviewed_only: bool,
) -> dict[str, Any]:
    docs = _load_docs(paths)
    refs = _load_reference(paths)

    (direct_preds, direct_logs), direct_t = timed_call(
        direct_extract,
        docs,
        cfg.ollama_url,
        cfg.direct_model,
        cfg.max_llm_retries,
    )
    write_jsonl(paths["extractions"] / "direct_llm_entities.jsonl", direct_preds)
    write_jsonl(paths["extractions"] / "direct_llm_logs.jsonl", direct_logs)

    (rules_preds, rules_logs), rules_t = timed_call(
        rules_extract,
        docs,
        paths["patterns"],
    )
    write_jsonl(paths["extractions"] / "rules_nlp_entities.jsonl", rules_preds)
    write_jsonl(paths["extractions"] / "rules_nlp_logs.jsonl", rules_logs)

    (hybrid_preds, hybrid_logs), hybrid_t = timed_call(
        hybrid_extract,
        docs,
        paths["patterns"],
        cfg.ollama_url,
        cfg.hybrid_model,
        cfg.max_llm_retries,
        enable_discovery_pass,
    )
    write_jsonl(paths["extractions"] / "hybrid_entities.jsonl", hybrid_preds)
    write_jsonl(paths["extractions"] / "hybrid_logs.jsonl", hybrid_logs)

    # LLM call estimation from log count.
    direct_calls = len(direct_logs)
    hybrid_calls = len([x for x in hybrid_logs if "classification_error" in x])

    metrics = [
        evaluate_method("direct_llm", docs, refs, direct_preds, direct_t, llm_calls=direct_calls, labels_reviewed_only=labels_reviewed_only),
        evaluate_method("rules_nlp", docs, refs, rules_preds, rules_t, llm_calls=0, labels_reviewed_only=labels_reviewed_only),
        evaluate_method("hybrid", docs, refs, hybrid_preds, hybrid_t, llm_calls=hybrid_calls, labels_reviewed_only=labels_reviewed_only),
    ]

    summary = {
        "documents": len(docs),
        "reference_docs": len(refs),
        "labels_reviewed_only": labels_reviewed_only,
        "method_metrics": metrics,
        "notes": [
            "Reference labels are provisional LLM-generated labels unless manually reviewed.",
            "Disagreement rows are intended as review queue, not automatic errors.",
        ],
    }

    write_reports(
        metrics_path=paths["metrics"] / "benchmark_metrics.json",
        report_path=paths["reports"] / "benchmark_report.md",
        review_queue_path=paths["reference_review"],
        summary=summary,
    )
    return summary


def main() -> None:
    args = _parse_args()
    cfg = _cfg_from_args(args)
    project_root = Path(args.project_root).resolve()
    paths = project_paths(project_root)

    if args.cmd in {"label-reference", "run-benchmark", "run-all"}:
        models = list_ollama_models(cfg.ollama_url)
        print({"ollama_models_detected": models})

    if args.cmd == "collect":
        result = _run_collect(cfg, paths)
        print(result)
        return

    if args.cmd == "label-reference":
        result = _run_reference(cfg, paths)
        print(result)
        return

    if args.cmd == "run-benchmark":
        result = _run_benchmark(
            cfg,
            paths,
            enable_discovery_pass=args.enable_discovery_pass,
            labels_reviewed_only=args.labels_reviewed_only,
        )
        print(result)
        return

    if args.cmd == "run-all":
        collect_result = _run_collect(cfg, paths)
        print({"collect": collect_result})
        ref_result = _run_reference(cfg, paths)
        print({"reference": ref_result})
        bench_result = _run_benchmark(
            cfg,
            paths,
            enable_discovery_pass=args.enable_discovery_pass,
            labels_reviewed_only=False,
        )
        print({"benchmark": bench_result})
        return


if __name__ == "__main__":
    main()
