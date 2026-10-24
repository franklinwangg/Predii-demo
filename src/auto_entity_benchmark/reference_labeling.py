from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .constants import ENTITY_TYPES
from .io_utils import read_jsonl, write_jsonl
from .llm_client import ollama_generate_json
from .schema import dedupe_entities, find_span, normalize_text, validate_entity


PROMPT_VERSION = "v1"


def _prompt(text: str) -> str:
    return (
        "You create provisional reference labels for automotive entities. "
        "Use only explicit evidence from the text. "
        "Return JSON with key 'entities' array. Each item must include mention, canonical_name, entity_type. "
        f"Allowed entity_type values: {', '.join(ENTITY_TYPES)}. "
        "Do not infer entities that are not directly present.\n\n"
        f"Text:\n{text}\n"
    )


def build_reference_labels(
    docs: list[dict[str, Any]],
    ollama_url: str,
    model: str,
    out_path,
    logs_path,
    max_llm_retries: int,
) -> dict[str, Any]:
    existing = read_jsonl(out_path)
    existing_ids = {row.get("document_id") for row in existing}

    labels = list(existing)
    logs: list[dict[str, Any]] = []
    failed = 0

    for doc in docs:
        if doc["document_id"] in existing_ids:
            continue

        result = ollama_generate_json(
            ollama_url=ollama_url,
            model=model,
            prompt=_prompt(doc["text"]),
            max_retries=max_llm_retries,
        )

        entities: list[dict[str, Any]] = []
        parsed = result.parsed_json.get("entities", []) if result.parsed_json else []
        if isinstance(parsed, list):
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                mention = str(item.get("mention", "")).strip()
                if not mention:
                    continue
                start, end = find_span(doc["text"], mention)
                ent = {
                    "mention": mention,
                    "canonical_name": normalize_text(str(item.get("canonical_name", mention))),
                    "entity_type": str(item.get("entity_type", "")).strip(),
                    "document_id": doc["document_id"],
                    "start_char": start,
                    "end_char": end,
                    "extraction_method": "reference_llm",
                    "confidence": None,
                    "review_status": "unreviewed",
                }
                ok, _ = validate_entity(ent)
                if ok:
                    entities.append(ent)

        entities = dedupe_entities(entities)
        if not entities:
            failed += 1

        labels.append(
            {
                "document_id": doc["document_id"],
                "model": model,
                "prompt_version": PROMPT_VERSION,
                "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "raw_response": result.raw_text,
                "parse_error": result.error,
                "labels_provisional": True,
                "review_status": "unreviewed",
                "entities": entities,
            }
        )

        logs.append(
            {
                "document_id": doc["document_id"],
                "model": model,
                "parsed_ok": result.parsed_json is not None,
                "entity_count": len(entities),
                "error": result.error,
            }
        )

    write_jsonl(out_path, labels)
    write_jsonl(logs_path, logs)

    return {
        "documents_input": len(docs),
        "labels_total": len(labels),
        "new_labels": len(logs),
        "failed_or_empty": failed,
        "cached_labels": len(existing),
    }
