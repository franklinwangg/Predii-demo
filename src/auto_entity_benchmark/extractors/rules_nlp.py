from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import spacy

from ..constants import ENTITY_TYPES
from ..schema import dedupe_entities, find_span, normalize_text, validate_entity


DTC_REGEX = re.compile(r"\b(?:DTC\s*)?([CPBU]\d{4})\b", re.IGNORECASE)


def _load_nlp() -> Any:
    try:
        return spacy.load("en_core_web_sm")
    except Exception:  # noqa: BLE001
        nlp = spacy.blank("en")
        if "sentencizer" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")
        return nlp


def _load_patterns(path: Path) -> dict[str, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, list[str]] = {}
    for key, vals in data.items():
        if key in ENTITY_TYPES and isinstance(vals, list):
            out[key] = [str(v).strip() for v in vals if str(v).strip()]
    return out


def extract(
    docs: list[dict[str, Any]],
    patterns_path: Path,
    extraction_method: str = "rules_nlp",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nlp = _load_nlp()
    patterns = _load_patterns(patterns_path)
    predictions: list[dict[str, Any]] = []
    logs: list[dict[str, Any]] = []

    for doc in docs:
        text = doc["text"]
        lowered = text.lower()
        entities: list[dict[str, Any]] = []

        for entity_type, terms in patterns.items():
            for term in terms:
                if term.lower() in lowered:
                    start, end = find_span(text, term)
                    mention = text[start:end] if start is not None else term
                    ent = {
                        "mention": mention,
                        "canonical_name": normalize_text(term),
                        "entity_type": entity_type,
                        "document_id": doc["document_id"],
                        "start_char": start,
                        "end_char": end,
                        "extraction_method": extraction_method,
                        "confidence": 0.65,
                        "review_status": "unreviewed",
                    }
                    ok, _ = validate_entity(ent)
                    if ok:
                        entities.append(ent)

        for match in DTC_REGEX.finditer(text):
            code = match.group(1).upper()
            ent = {
                "mention": match.group(0),
                "canonical_name": code,
                "entity_type": "diagnostic_trouble_code",
                "document_id": doc["document_id"],
                "start_char": match.start(),
                "end_char": match.end(),
                "extraction_method": extraction_method,
                "confidence": 0.95,
                "review_status": "unreviewed",
            }
            ok, _ = validate_entity(ent)
            if ok:
                entities.append(ent)

        # Keep noun-chunk-like candidates when spaCy model supports POS/chunks.
        parsed = nlp(text)
        candidate_count = 0
        if hasattr(parsed, "noun_chunks"):
            try:
                for chunk in parsed.noun_chunks:
                    cand = chunk.text.strip()
                    if len(cand) < 4:
                        continue
                    if not re.search(r"brake|abs|actuator|booster|pump|inverter|fluid|warning", cand, re.IGNORECASE):
                        continue
                    start, end = find_span(text, cand)
                    ent = {
                        "mention": cand,
                        "canonical_name": normalize_text(cand),
                        "entity_type": "other_automotive_technical_concept",
                        "document_id": doc["document_id"],
                        "start_char": start,
                        "end_char": end,
                        "extraction_method": extraction_method,
                        "confidence": 0.45,
                        "review_status": "unreviewed",
                    }
                    ok, _ = validate_entity(ent)
                    if ok:
                        entities.append(ent)
                        candidate_count += 1
            except Exception:
                pass

        predictions.extend(dedupe_entities(entities))
        logs.append({"document_id": doc["document_id"], "candidate_entities": len(entities), "noun_chunk_candidates": candidate_count})

    return predictions, logs
