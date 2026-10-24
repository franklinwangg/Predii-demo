from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .constants import ENTITY_TYPES


@dataclass
class EntityMention:
    mention: str
    canonical_name: str
    entity_type: str
    document_id: str
    start_char: int | None = None
    end_char: int | None = None
    extraction_method: str = ""
    confidence: float | None = None
    review_status: str = "unreviewed"


def normalize_text(value: str) -> str:
    return " ".join(value.lower().strip().split())


def validate_entity(entity: dict[str, Any]) -> tuple[bool, str]:
    required = ["mention", "canonical_name", "entity_type", "document_id"]
    for key in required:
        if key not in entity or not str(entity.get(key, "")).strip():
            return False, f"missing_or_empty_{key}"
    if entity["entity_type"] not in ENTITY_TYPES:
        return False, "invalid_entity_type"
    if "start_char" in entity and entity["start_char"] is not None and entity["start_char"] < 0:
        return False, "invalid_start_char"
    if "end_char" in entity and entity["end_char"] is not None and entity["end_char"] < 0:
        return False, "invalid_end_char"
    if (
        entity.get("start_char") is not None
        and entity.get("end_char") is not None
        and entity["end_char"] < entity["start_char"]
    ):
        return False, "invalid_offset_order"
    return True, "ok"


def dedupe_entities(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str, int | None, int | None]] = set()
    output: list[dict[str, Any]] = []
    for ent in entities:
        key = (
            ent.get("document_id", ""),
            normalize_text(ent.get("mention", "")),
            ent.get("entity_type", ""),
            ent.get("start_char"),
            ent.get("end_char"),
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(ent)
    return output


def find_span(text: str, mention: str) -> tuple[int | None, int | None]:
    lowered_text = text.lower()
    lowered_mention = mention.lower()
    idx = lowered_text.find(lowered_mention)
    if idx < 0:
        return None, None
    return idx, idx + len(mention)
