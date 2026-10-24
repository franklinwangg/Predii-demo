from auto_entity_benchmark.schema import dedupe_entities, find_span, validate_entity


def test_validate_entity_ok() -> None:
    ent = {
        "mention": "Brake booster",
        "canonical_name": "brake booster",
        "entity_type": "component_part",
        "document_id": "d1",
        "start_char": 10,
        "end_char": 23,
    }
    ok, reason = validate_entity(ent)
    assert ok
    assert reason == "ok"


def test_validate_entity_bad_type() -> None:
    ent = {
        "mention": "Brake booster",
        "canonical_name": "brake booster",
        "entity_type": "bad_type",
        "document_id": "d1",
    }
    ok, reason = validate_entity(ent)
    assert not ok
    assert reason == "invalid_entity_type"


def test_dedupe_entities() -> None:
    items = [
        {
            "mention": "Brake booster",
            "canonical_name": "brake booster",
            "entity_type": "component_part",
            "document_id": "d1",
            "start_char": 0,
            "end_char": 13,
        },
        {
            "mention": "Brake booster",
            "canonical_name": "brake booster",
            "entity_type": "component_part",
            "document_id": "d1",
            "start_char": 0,
            "end_char": 13,
        },
    ]
    out = dedupe_entities(items)
    assert len(out) == 1


def test_find_span() -> None:
    text = "The brake booster failed suddenly."
    start, end = find_span(text, "brake booster")
    assert start == 4
    assert end == 17
