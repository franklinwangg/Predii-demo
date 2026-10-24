from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import requests


@dataclass
class LLMResult:
    model: str
    raw_text: str
    parsed_json: dict[str, Any] | None
    error: str | None = None


def list_ollama_models(ollama_url: str) -> list[str]:
    try:
        resp = requests.get(f"{ollama_url.rstrip('/')}/api/tags", timeout=20)
        resp.raise_for_status()
        data = resp.json()
        return [m.get("name", "") for m in data.get("models", []) if m.get("name")]
    except Exception:  # noqa: BLE001
        return []


def _extract_json_block(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


def ollama_generate_json(
    ollama_url: str,
    model: str,
    prompt: str,
    max_retries: int = 2,
    temperature: float = 0.0,
) -> LLMResult:
    url = f"{ollama_url.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": temperature},
    }

    last_error: str | None = None
    last_text = ""
    for _ in range(max_retries + 1):
        try:
            resp = requests.post(url, json=payload, timeout=180)
            resp.raise_for_status()
            body = resp.json()
            last_text = body.get("response", "")
            parsed = _extract_json_block(last_text)
            if parsed is not None:
                return LLMResult(model=model, raw_text=last_text, parsed_json=parsed)
            last_error = "invalid_json"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)

    return LLMResult(model=model, raw_text=last_text, parsed_json=None, error=last_error)
