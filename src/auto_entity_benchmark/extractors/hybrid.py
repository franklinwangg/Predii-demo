from __future__ import annotations

from typing import Any

from ..constants import ENTITY_TYPES
from ..llm_client import ollama_generate_json
from ..schema import dedupe_entities, normalize_text, validate_entity
from .rules_nlp import extract as rules_extract


def _classification_prompt(text: str, candidates: list[dict[str, Any]]) -> str:
    candidate_lines = []
    for i, c in enumerate(candidates, start=1):
        candidate_lines.append(f"{i}. mention='{c['mention']}'")
    return (
        "You classify candidate automotive phrases. "
        "Return JSON with key 'decisions' as array of objects: "
        "index (integer), keep (true/false), entity_type (one allowed type), canonical_name (string). "
        f"Allowed entity_type values: {', '.join(ENTITY_TYPES)}. "
        "Use only evidence from context.\n\n"
        f"Context:\n{text}\n\n"
        "Candidates:\n"
        + "\n".join(candidate_lines)
    )


def _discovery_prompt(text: str) -> str:
    return (
        "Find additional automotive entities that may be missing from candidate phrases. "
        "Return strict JSON with key 'entities' array and fields mention, canonical_name, entity_type. "
        f"Allowed entity_type values: {', '.join(ENTITY_TYPES)}.\n\n"
        f"Text:\n{text}\n"
    )


def extract(
    docs: list[dict[str, Any]],
    patterns_path,
    ollama_url: str,
    model: str,
    max_llm_retries: int,
    enable_discovery_pass: bool,
    extraction_method: str = "hybrid",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rule_predictions, rule_logs = rules_extract(docs=docs, patterns_path=patterns_path, extraction_method="hybrid_rules_seed")
    by_doc: dict[str, list[dict[str, Any]]] = {}
    for item in rule_predictions:
        by_doc.setdefault(item["document_id"], []).append(item)

    output: list[dict[str, Any]] = []
    logs: list[dict[str, Any]] = []

    for doc in docs:
        doc_candidates = by_doc.get(doc["document_id"], [])
        class_result = ollama_generate_json(
            ollama_url=ollama_url,
            model=model,
            prompt=_classification_prompt(doc["text"], doc_candidates),
            max_retries=max_llm_retries,
        )

        decisions = []
        if class_result.parsed_json:
            decisions = class_result.parsed_json.get("decisions", [])

        accepted: list[dict[str, Any]] = []
        if isinstance(decisions, list):
            for decision in decisions:
                if not isinstance(decision, dict):
                    continue
                idx = int(decision.get("index", 0)) - 1
                keep = bool(decision.get("keep", False))
                if not keep or idx < 0 or idx >= len(doc_candidates):
                    continue
                base = dict(doc_candidates[idx])
                et = str(decision.get("entity_type", base["entity_type"]))
                cn = str(decision.get("canonical_name", base["canonical_name"]))
                base["entity_type"] = et
                base["canonical_name"] = normalize_text(cn or base["mention"])
                base["extraction_method"] = extraction_method
                base["confidence"] = 0.8
                ok, _ = validate_entity(base)
                if ok:
                    accepted.append(base)

        discovery_added = 0
        if enable_discovery_pass:
            discovery_result = ollama_generate_json(
                ollama_url=ollama_url,
                model=model,
                prompt=_discovery_prompt(doc["text"]),
                max_retries=max_llm_retries,
            )
            maybe = discovery_result.parsed_json.get("entities", []) if discovery_result.parsed_json else []
            if isinstance(maybe, list):
                for item in maybe:
                    if not isinstance(item, dict):
                        continue
                    ent = {
                        "mention": str(item.get("mention", "")).strip(),
                        "canonical_name": normalize_text(str(item.get("canonical_name", item.get("mention", "")))),
                        "entity_type": str(item.get("entity_type", "")).strip(),
                        "document_id": doc["document_id"],
                        "start_char": None,
                        "end_char": None,
                        "extraction_method": extraction_method + "_discovery",
                        "confidence": 0.55,
                        "review_status": "unreviewed",
                    }
                    ok, _ = validate_entity(ent)
                    if ok:
                        accepted.append(ent)
                        discovery_added += 1

        accepted = dedupe_entities(accepted)
        output.extend(accepted)
        logs.append(
            {
                "document_id": doc["document_id"],
                "seed_candidates": len(doc_candidates),
                "accepted": len(accepted),
                "discovery_enabled": enable_discovery_pass,
                "discovery_added": discovery_added,
                "classification_error": class_result.error,
            }
        )

    logs.extend(rule_logs)
    return output, logs
