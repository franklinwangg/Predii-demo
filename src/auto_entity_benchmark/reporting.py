from __future__ import annotations

from pathlib import Path
from typing import Any

from .io_utils import write_json, write_jsonl


def _table_row(m: dict[str, Any]) -> str:
    strict = m["strict_exact_span"]
    norm = m["normalized_match"]
    return (
        f"| {m['method']} | {strict['precision']:.3f} | {strict['recall']:.3f} | {strict['f1']:.3f} | "
        f"{norm['precision']:.3f} | {norm['recall']:.3f} | {norm['f1']:.3f} | "
        f"{m['runtime_seconds']:.2f} | {m['llm_calls']} |"
    )


def write_reports(
    metrics_path: Path,
    report_path: Path,
    review_queue_path: Path,
    summary: dict[str, Any],
) -> None:
    write_json(metrics_path, summary)

    lines = [
        "# Automotive Entity Extraction Benchmark Report",
        "",
        "This report uses provisional LLM-generated reference labels (not verified ground truth).",
        "",
        "## Overall Comparison",
        "",
        "| Method | Strict P | Strict R | Strict F1 | Norm P | Norm R | Norm F1 | Runtime(s) | LLM Calls |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for m in summary["method_metrics"]:
        lines.append(_table_row(m))

    lines.extend([
        "",
        "## Per-Type Metrics",
        "",
    ])

    for m in summary["method_metrics"]:
        lines.append(f"### {m['method']}")
        lines.append("")
        lines.append("| Entity Type | P | R | F1 | TP | FP | FN |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|")
        for et, vals in m["per_entity_type"].items():
            lines.append(
                f"| {et} | {vals['precision']:.3f} | {vals['recall']:.3f} | {vals['f1']:.3f} | {vals['tp']} | {vals['fp']} | {vals['fn']} |"
            )
        lines.append("")

    lines.extend([
        "## Error Analysis",
        "",
        "Review queue contains disagreements and potential label gaps.",
        "",
        f"Review queue file: {review_queue_path}",
        "",
    ])

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")

    review_rows = []
    for m in summary["method_metrics"]:
        for row in m["disagreements"]:
            review_rows.append({"method": m["method"], **row})
    write_jsonl(review_queue_path, review_rows)
