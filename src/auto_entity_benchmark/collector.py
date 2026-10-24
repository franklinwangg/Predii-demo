from __future__ import annotations

import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .config import PipelineConfig
from .io_utils import ensure_dir, read_json, write_json, write_jsonl


API_BASE = "https://api.nhtsa.gov"


def _session(max_retries: int) -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=max_retries,
        connect=max_retries,
        read=max_retries,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({"User-Agent": "auto-entity-benchmark/0.1"})
    return session


def _json_to_html_snapshot(source_url: str, payload: dict[str, Any]) -> str:
    pretty = __import__("json").dumps(payload, indent=2, ensure_ascii=False)
    return (
        "<!doctype html>\n"
        "<html><head><meta charset='utf-8'><title>NHTSA API Snapshot</title></head><body>\n"
        f"<h1>NHTSA API Snapshot</h1><p>source={source_url}</p>\n"
        f"<pre>{pretty}</pre>\n"
        "</body></html>\n"
    )


def _fetch_year_payload(
    session: requests.Session,
    make: str,
    model: str,
    year: int,
    timeout: int,
) -> dict[str, Any]:
    url = f"{API_BASE}/complaints/complaintsByVehicle"
    params = {"make": make, "model": model, "modelYear": year}
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload: dict[str, Any] = response.json()
    payload["_source_url"] = response.url
    payload["_collected_at_utc"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return payload


def collect_or_import_documents(
    cfg: PipelineConfig,
    raw_api_dir: Path,
    raw_html_dir: Path,
    processed_docs_path: Path,
    splits_path: Path,
) -> dict[str, Any]:
    ensure_dir(raw_api_dir)
    ensure_dir(raw_html_dir)
    ensure_dir(processed_docs_path.parent)

    session = _session(cfg.max_retries)

    all_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for year in range(cfg.start_year, cfg.end_year + 1):
        cache_path = raw_api_dir / f"complaints_{year}.json"
        if cache_path.exists():
            payload = read_json(cache_path)
        else:
            if cfg.dry_run:
                payload = {"results": [], "_source_url": "dry-run", "_collected_at_utc": "dry-run"}
            else:
                try:
                    payload = _fetch_year_payload(
                        session=session,
                        make=cfg.make,
                        model=cfg.model,
                        year=year,
                        timeout=cfg.request_timeout_seconds,
                    )
                except Exception as exc:  # noqa: BLE001
                    errors.append({"year": year, "error": str(exc)})
                    continue
            write_json(cache_path, payload)
            time.sleep(cfg.request_delay_seconds)

        html_path = raw_html_dir / f"complaints_{year}.html"
        if not html_path.exists():
            html_path.write_text(
                _json_to_html_snapshot(payload.get("_source_url", ""), payload),
                encoding="utf-8",
            )

        for row in payload.get("results", []):
            summary = (row.get("summary") or "").strip()
            complaint_id = str(row.get("odiNumber", "")).strip()
            if not summary or not complaint_id:
                continue
            all_rows.append(
                {
                    "document_id": f"complaint_{complaint_id}",
                    "source": "nhtsa_api",
                    "source_type": "complaint",
                    "source_url": payload.get("_source_url", ""),
                    "collection_timestamp_utc": payload.get("_collected_at_utc", ""),
                    "complaint_id": complaint_id,
                    "make": cfg.make,
                    "model": cfg.model,
                    "model_year": year,
                    "text": summary,
                    "metadata": {
                        "component": row.get("component", ""),
                        "dateOfIncident": row.get("dateOfIncident", ""),
                        "dateComplaintFiled": row.get("dateComplaintFiled", ""),
                    },
                }
            )

    # Deduplicate by document_id and text hash.
    dedup: dict[tuple[str, str], dict[str, Any]] = {}
    for row in all_rows:
        key = (row["document_id"], row["text"].strip().lower())
        dedup[key] = row

    docs = list(dedup.values())
    rng = random.Random(cfg.sample_seed)
    if cfg.sample_size > 0 and len(docs) > cfg.sample_size:
        docs = rng.sample(docs, cfg.sample_size)

    docs.sort(key=lambda x: x["document_id"])
    write_jsonl(processed_docs_path, docs)

    # Fixed split for dev/eval.
    doc_ids = [d["document_id"] for d in docs]
    rng.shuffle(doc_ids)
    split_idx = int(len(doc_ids) * cfg.dev_ratio)
    dev_ids = sorted(doc_ids[:split_idx])
    eval_ids = sorted(doc_ids[split_idx:])
    write_json(
        splits_path,
        {
            "seed": cfg.sample_seed,
            "dev_ratio": cfg.dev_ratio,
            "dev_document_ids": dev_ids,
            "eval_document_ids": eval_ids,
        },
    )

    return {
        "documents_total": len(docs),
        "dev_docs": len(dev_ids),
        "eval_docs": len(eval_ids),
        "errors": errors,
        "note": "Saved API payloads plus HTML proxy snapshots because official complaint page HTML is not always available programmatically.",
    }
