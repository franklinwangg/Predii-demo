from auto_entity_benchmark.evaluation import evaluate_method


def test_evaluate_method_basic() -> None:
    docs = [{"document_id": "d1", "text": "Brake booster failed."}]
    refs = [
        {
            "document_id": "d1",
            "review_status": "unreviewed",
            "entities": [
                {
                    "mention": "Brake booster",
                    "canonical_name": "brake booster",
                    "entity_type": "component_part",
                    "document_id": "d1",
                    "start_char": 0,
                    "end_char": 13,
                }
            ],
        }
    ]
    preds = [
        {
            "mention": "Brake booster",
            "canonical_name": "brake booster",
            "entity_type": "component_part",
            "document_id": "d1",
            "start_char": 0,
            "end_char": 13,
        }
    ]

    m = evaluate_method(
        method_name="x",
        docs=docs,
        reference_rows=refs,
        predicted_entities=preds,
        runtime_seconds=1.2,
        llm_calls=1,
    )
    assert m["strict_exact_span"]["f1"] == 1.0
    assert m["normalized_match"]["f1"] == 1.0
