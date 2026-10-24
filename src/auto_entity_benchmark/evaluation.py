from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

from .constants import ENTITY_TYPES
from .schema import normalize_text


def _to_key_exact(ent: dict[str, Any]) -> tuple[str, str, int | None, int | None]:
    return (
        ent.get("entity_type", ""),
        normalize_text(ent.get("mention", "")),
        ent.get("start_char"),
        ent.get("end_char"),
    )


def _to_key_norm(ent: dict[str, Any]) -> tuple[str, str]:
    return (
        ent.get("entity_type", ""),
        normalize_text(ent.get("canonical_name", ent.get("mention", ""))),
    )


def _score_set(gold: set[Any], pred: set[Any]) -> dict[str, float | int]:
    tp = len(gold & pred)
    fp = len(pred - gold)
    fn = len(gold - pred)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}


def evaluate_method(
    method_name: str,
    docs: list[dict[str, Any]],
    reference_rows: list[dict[str, Any]],
    predicted_entities: list[dict[str, Any]],
    runtime_seconds: float,
    llm_calls: int,
    token_usage: int | None = None,
    labels_reviewed_only: bool = False,
) -> dict[str, Any]:
    ref_by_doc = {row["document_id"]: row for row in reference_rows}
    pred_by_doc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in predicted_entities:
        pred_by_doc[p["document_id"]].append(p)

    all_gold_exact: set[Any] = set()
    all_pred_exact: set[Any] = set()
    all_gold_norm: set[Any] = set()
    all_pred_norm: set[Any] = set()

    per_type_exact: dict[str, dict[str, int]] = {t: {"tp": 0, "fp": 0, "fn": 0} for t in ENTITY_TYPES}

    disagreement_rows: list[dict[str, Any]] = []
    unique_candidates: set[str] = set()

    for doc in docs:
        doc_id = doc["document_id"]
        ref_row = ref_by_doc.get(doc_id)
        if not ref_row:
            continue
        if labels_reviewed_only and ref_row.get("review_status") != "reviewed":
            continue

        gold_entities = ref_row.get("entities", [])
        pred_entities = pred_by_doc.get(doc_id, [])

        gold_exact = {_to_key_exact(x) for x in gold_entities}
        pred_exact = {_to_key_exact(x) for x in pred_entities}
        gold_norm = {_to_key_norm(x) for x in gold_entities}
        pred_norm = {_to_key_norm(x) for x in pred_entities}

        all_gold_exact |= gold_exact
        all_pred_exact |= pred_exact
        all_gold_norm |= gold_norm
        all_pred_norm |= pred_norm

        for entity_type in ENTITY_TYPES:
            g = {x for x in gold_exact if x[0] == entity_type}
            p = {x for x in pred_exact if x[0] == entity_type}
            per_type_exact[entity_type]["tp"] += len(g & p)
            per_type_exact[entity_type]["fp"] += len(p - g)
            per_type_exact[entity_type]["fn"] += len(g - p)

        missing_from_ref = pred_norm - gold_norm
        missing_from_pred = gold_norm - pred_norm

        for k in missing_from_ref:
            disagreement_rows.append(
                {
                    "document_id": doc_id,
                    "issue": "predicted_not_in_reference",
                    "entity_type": k[0],
                    "value": k[1],
                }
            )
            unique_candidates.add(k[1])

        for k in missing_from_pred:
            disagreement_rows.append(
                {
                    "document_id": doc_id,
                    "issue": "reference_missing_in_prediction",
                    "entity_type": k[0],
                    "value": k[1],
                }
            )

    exact_scores = _score_set(all_gold_exact, all_pred_exact)
    norm_scores = _score_set(all_gold_norm, all_pred_norm)

    per_type_metrics = {}
    for t, counts in per_type_exact.items():
        tp = counts["tp"]
        fp = counts["fp"]
        fn = counts["fn"]
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per_type_metrics[t] = {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }

    docs_count = max(len(docs), 1)
    new_entities_per_100_docs = round((len(unique_candidates) / docs_count) * 100, 2)

    return {
        "method": method_name,
        "labels_scope": "reviewed_only" if labels_reviewed_only else "all_reference_labels",
        "strict_exact_span": exact_scores,
        "normalized_match": norm_scores,
        "per_entity_type": per_type_metrics,
        "runtime_seconds": round(runtime_seconds, 3),
        "runtime_per_doc_seconds": round(runtime_seconds / docs_count, 4),
        "llm_calls": llm_calls,
        "token_usage_estimate": token_usage,
        "unique_candidate_entities": len(unique_candidates),
        "new_entities_per_100_docs": new_entities_per_100_docs,
        "errors_or_invalid_outputs": 0,
        "disagreements": disagreement_rows,
    }


def timed_call(func, *args, **kwargs):
    start = time.perf_counter()
    result = func(*args, **kwargs)
    elapsed = time.perf_counter() - start
    return result, elapsed
