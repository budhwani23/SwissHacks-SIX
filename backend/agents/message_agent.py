"""
message_agent.py - Generate a draft RM advisory message.

This is a draft for the relationship manager.
The RM reviews and decides. The client makes the final decision.
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import database as db
from services.llm_service import call_llm
from agents.crm_agent import extract_client_dna
from agents.portfolio_agent import find_replacement

COMPLIANCE_FOOTER = """
---
COMPLIANCE NOTE: This message is a draft prepared for RM review only.
It does not constitute investment advice. The relationship manager must
review and approve before sending. All recommendations are within the
approved CIO mandate. The client makes the final investment decision.
"""

TONE_INSTRUCTIONS = {
    "analytical": "Be precise, data-driven, and professional. Use factual language.",
    "values-led": "Lead with the client's personal values and what this means to them personally. Be warm and empathetic.",
    "concise": "Be very brief. Maximum 3 short paragraphs. No preamble.",
    "detailed": "Be thorough. Explain the situation fully, provide full context and reasoning."
}


def generate_message(
    client_id: str,
    alert_id: int,
    tone: str = "values-led",
    replacement: dict = None
) -> dict:
    """
    Generate a draft RM message for a specific alert.
    Returns the saved message dict.
    """
    client = db.get_client(client_id)
    if not client:
        raise ValueError(f"Client '{client_id}' not found")

    # Get alert details
    alerts = db.get_alerts(client_id)
    alert = next((a for a in alerts if a["id"] == alert_id), None)
    if not alert:
        raise ValueError(f"Alert {alert_id} not found for client {client_id}")

    # Get client DNA
    try:
        dna = extract_client_dna(client_id)
    except Exception:
        dna = {}

    # Get news event
    news_events = db.get_all_news()
    news = next((n for n in news_events if n["id"] == alert.get("news_id")), {})

    # Find replacement if not provided
    if replacement is None and alert.get("alert_type") not in ("Positive opportunity",):
        holdings = db.get_holdings(client_id)
        affected = next((h for h in holdings if h["issuer"] == alert.get("holding")), None)
        if affected:
            try:
                replacement = find_replacement(affected, dna, client["strategy"])
            except Exception:
                replacement = None

    tone_instruction = TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["values-led"])
    client_name = client["name"]
    comm_style = dna.get("communication_style", "professional")

    replacement_section = ""
    if replacement:
        replacement_section = f"""
A possible alternative within the same sector that is CIO-approved:
- Sell: {replacement['sell']}
- Consider: {replacement['buy']} ({replacement.get('cio_rating','')}-rated)
- Rationale: {replacement.get('reason','')}
"""

    prompt = f"""
You are a Swiss private banking AI drafting a message for the relationship manager to send to a client.

Tone instruction: {tone_instruction}
Client communication style: {comm_style}

Context:
- Client: {client_name}
- Strategy: {client['strategy']}
- Alert type: {alert.get('alert_type')}
- Affected holding: {alert.get('holding')}
- News event: {news.get('headline', alert.get('news_headline', 'N/A'))}
- Why it matters: {alert.get('reason')}
- Alert severity: {alert.get('severity')}
{replacement_section}

Instructions:
1. Address the client by name (Dear Mr./Ms. {client_name})
2. Open by flagging the development that may be personally relevant
3. Briefly explain why it matters given their personal situation (without being patronising)
4. If there is a suggested replacement, mention it as a possible avenue to explore
5. End by suggesting a review meeting – the RM and client decide together
6. Do NOT include specific price targets or guarantees
7. Do NOT claim this is investment advice
8. Keep tone appropriate to the client's communication style

Write the message now:
"""

    content = call_llm(prompt)
    content_with_footer = content + COMPLIANCE_FOOTER

    msg_id = db.insert_message(
        client_id=client_id,
        alert_id=alert_id,
        tone=tone,
        content=content_with_footer
    )

    return {
        "id": msg_id,
        "client_id": client_id,
        "alert_id": alert_id,
        "tone": tone,
        "content": content_with_footer,
        "replacement": replacement
    }
