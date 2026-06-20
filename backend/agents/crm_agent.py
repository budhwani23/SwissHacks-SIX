"""
crm_agent.py - Extract structured Client DNA from raw CRM notes.
Caches result in DB so LLM is not called on every request.

Token-efficient strategy:
  - DNA extraction (first call): uses ALL notes — unavoidable, but cached forever.
  - Subsequent queries: use FTS5 search_crm_notes() to retrieve only relevant
    notes before any LLM call, reducing token usage by ~90%.
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import database as db
from services.llm_service import call_llm_json

SYSTEM_PROMPT = """You are a Swiss private banking relationship manager assistant.
Your job is to read internal CRM notes and extract a structured client DNA profile.
Return ONLY valid JSON. Be precise and concise."""

# Topics we always want to find relevant notes for during DNA extraction
DNA_SEARCH_TOPICS = [
    "values", "avoid", "concern", "risk", "family", "foundation",
    "esg", "sustainability", "preference", "exclusion", "mandate",
    "medical", "parkinson", "charity", "reputation", "rebalance",
    "ai", "technology", "dividend", "capital preservation",
]


def extract_client_dna(client_id: str, force_refresh: bool = False) -> dict:
    """
    Returns the client DNA dict. Reads from DB cache unless force_refresh=True.

    On first call (or refresh): fetches ALL notes and sends to LLM.
    Result is cached in dna_json — LLM is NOT called again unless force_refresh.
    """
    client = db.get_client(client_id)
    if not client:
        raise ValueError(f"Client '{client_id}' not found")

    # Return cached DNA if available
    if client.get("dna_json") and not force_refresh:
        return json.loads(client["dna_json"])

    # For DNA extraction we use ALL notes (this call is cached — happens only once)
    notes = db.get_crm_notes(client_id)
    if not notes:
        return {"error": "No CRM notes found for this client"}

    combined_notes = "\n\n".join(
        f"[{n['date']}]\n{n['note']}" for n in notes
    )

    prompt = f"""
Extract the investment DNA for client "{client['name']}" from these CRM notes.

Return a JSON object with these exact fields:
{{
  "client_name": "<name>",
  "strategy": "<Defensive|Balanced|Growth>",
  "values": ["<list of personal values and priorities>"],
  "avoid": ["<companies, sectors, or themes to avoid>"],
  "red_flags": ["<specific triggers that would cause personal conflict>"],
  "risk_style": "<conservative|balanced|aggressive>",
  "communication_style": "<e.g. analytical and precise, values-led, emotional but structured>",
  "important_life_events": ["<significant personal/family context>"],
  "preferred_sectors": ["<sectors the client favours>"],
  "investment_preferences": ["<specific preferences>"],
  "family_context": "<brief summary of relevant family situation>",
  "business_context": "<brief summary of professional/business context>"
}}

CRM Notes:
{combined_notes}
"""

    dna = call_llm_json(prompt, system=SYSTEM_PROMPT)

    # Cache in DB — subsequent calls return this instantly, no LLM cost
    db.upsert_client_dna(client_id, json.dumps(dna))

    return dna


def get_relevant_notes(client_id: str, topics: list[str], limit: int = 5) -> list[dict]:
    """
    FTS5-powered retrieval of only the CRM notes relevant to given topics.
    Use this instead of get_crm_notes() whenever you don't need all notes.

    Example:
        notes = get_relevant_notes("schneider", ["parkinson", "healthcare", "research"])
        # Returns only 1-3 notes instead of 20 — 90% fewer LLM tokens
    """
    if not topics:
        return []
    return db.search_crm_notes(client_id, topics, limit=limit)


def get_dna_keywords(dna: dict) -> list[str]:
    """
    Extract searchable keywords from an existing DNA dict.
    Used to build FTS5 search terms for contextual note retrieval.
    """
    keywords = []
    for field in ("values", "avoid", "red_flags", "preferred_sectors", "investment_preferences"):
        items = dna.get(field, [])
        for item in items:
            # Take first word of each phrase to keep FTS5 queries tight
            first_word = item.split()[0].lower() if item else ""
            if first_word and len(first_word) > 3:
                keywords.append(first_word)
    return list(set(keywords))[:10]  # cap at 10 terms
