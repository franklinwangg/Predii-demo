from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class PipelineConfig:
    make: str = "TOYOTA"
    model: str = "PRIUS"
    start_year: int = 2010
    end_year: int = 2015
    sample_size: int = 80
    sample_seed: int = 42
    dev_ratio: float = 0.5
    request_delay_seconds: float = 0.35
    request_timeout_seconds: int = 45
    max_retries: int = 5
    ollama_url: str = "http://localhost:11434"
    reference_model: str = "qwen2.5:7b-instruct"
    direct_model: str = "qwen2.5:3b-instruct"
    hybrid_model: str = "qwen2.5:3b-instruct"
    max_llm_retries: int = 2
    dry_run: bool = False


def project_paths(project_root: Path) -> dict[str, Path]:
    return {
        "raw_api": project_root / "data" / "raw" / "api",
        "raw_html": project_root / "data" / "raw" / "html_proxy",
        "processed_docs": project_root / "data" / "processed" / "documents.jsonl",
        "splits": project_root / "data" / "processed" / "splits.json",
        "reference_labels": project_root / "data" / "reference" / "labels.jsonl",
        "reference_review": project_root / "data" / "reference" / "review_queue.jsonl",
        "extractions": project_root / "data" / "extractions",
        "metrics": project_root / "data" / "metrics",
        "reports": project_root / "reports",
        "patterns": project_root / "config" / "entity_patterns.json",
    }
