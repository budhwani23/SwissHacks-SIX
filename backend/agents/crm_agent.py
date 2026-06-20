"""
crm_agent.py - Extract structured Client DNA from raw CRM notes.
Caches result in DB so LLM is not called on every request.
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


def extract_client_dna(client_id: str, force_refresh: bool = False) -> dict:
    """
    Returns the client DNA dict. Reads from DB cache unless force_refresh=True.
    """
    client = db.get_client(client_id)
    if not client:
        raise ValueError(f"Client '{client_id}' not found")

    # Return cached DNA if available
    if client.get("dna_json") and not force_refresh:
        return json.loads(client["dna_json"])

    # Fetch all CRM notes
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

    # Cache in DB
    db.upsert_client_dna(client_id, json.dumps(dna))

    return dna
