"""
llm_service.py - Phoeniqs LLM calls via OpenAI-compatible API

Endpoint : https://maas.phoeniqs.com/v1
Model    : inference-gpt-oss-120b
Auth     : PHOENIQS_API_KEY
"""
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ─── Phoeniqs config (hardcoded defaults, overridable via .env) ──────────────
PHOENIQS_BASE_URL = os.getenv("PHOENIQS_BASE_URL", "https://maas.phoeniqs.com/v1")
PHOENIQS_API_KEY  = os.getenv("PHOENIQS_API_KEY")
PHOENIQS_MODEL    = os.getenv("PHOENIQS_MODEL", "inference-gpt-oss-120b")

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if not PHOENIQS_API_KEY:
        raise RuntimeError("PHOENIQS_API_KEY is not configured")
    if _client is None:
        _client = OpenAI(
            base_url=PHOENIQS_BASE_URL,
            api_key=PHOENIQS_API_KEY,
        )
    return _client


def call_llm(prompt: str, system: str = None, json_mode: bool = False) -> str:
    """
    Call Phoeniqs inference-gpt-oss-120b.
    Returns raw string response.
    Set json_mode=True to request structured JSON output.
    """
    client = _get_client()

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    kwargs = dict(
        model=PHOENIQS_MODEL,
        messages=messages,
        temperature=0.3,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


def call_llm_json(prompt: str, system: str = None) -> dict:
    """Call LLM and parse JSON response. Returns dict."""
    raw = call_llm(prompt, system=system, json_mode=True)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # fallback: strip markdown code fences if model wraps output
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned)
