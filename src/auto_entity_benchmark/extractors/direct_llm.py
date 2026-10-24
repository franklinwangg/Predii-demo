from __future__ import annotations

from typing import Any

from ..constants import ENTITY_TYPES
from ..llm_client import ollama_generate_json
from ..schema import dedupe_entities, find_span, validate_entity


def _prompt(text: str) -> str:
    return (
        "You extract automotive entities from complaint text. "
        "Return strict JSON with a top-level key 'entities' containing an array. "
        "Each entity item must include: mention, canonical_name, entity_type. "
        f"Allowed entity_type values: {', '.join(ENTITY_TYPES)}. "
        "Use only entities explicitly present in the text. Do not invent entities.\n\n"
        f"Complaint text:\n{text}\n"
    )


def extract(
    docs: list[dict[str, Any]],
    ollama_url: str,
    model: str,
    max_llm_retries: int,
    extraction_method: str = "direct_llm",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    predictions: list[dict[str, Any]] = []
    logs: list[dict[str, Any]] = []

    for doc in docs:
        result = ollama_generate_json(
            ollama_url=ollama_url,
            model=model,
            prompt=_prompt(doc["text"]),
            max_retries=max_llm_retries,
        )

        entities = []
        parsed_entities = []
        if result.parsed_json:
            parsed_entities = result.parsed_json.get("entities", [])
        if isinstance(parsed_entities, list):
            for item in parsed_entities:
                if not isinstance(item, dict):
                    continue
                mention = str(item.get("mention", "")).strip()
                canonical = str(item.get("canonical_name", mention)).strip()
                entity_type = str(item.get("entity_type", "")).strip()
                if not mention:
                    continue
                start, end = find_span(doc["text"], mention)
                ent = {
                    "mention": mention,
                    "canonical_name": canonical or mention,
                    "entity_type": entity_type,
                    "document_id": doc["document_id"],
                    "start_char": start,
                    "end_char": end,
                    "extraction_method": extraction_method,
                    "confidence": None,
                    "review_status": "unreviewed",
                }
                ok, _ = validate_entity(ent)
                if ok:
                    entities.append(ent)

        predictions.extend(dedupe_entities(entities))
        logs.append(
            {
                "document_id": doc["document_id"],
                "model": model,
                "raw_response": result.raw_text,
                "error": result.error,
                "parsed_ok": result.parsed_json is not None,
            }
        )

    return predictions, logs
