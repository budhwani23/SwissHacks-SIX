"""
portfolio_agent.py - Return structured holdings for a client,
enriched with drift and CIO alignment signals.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import database as db


def get_client_portfolio(client_id: str) -> dict:
    """
    Returns the client's holdings with computed drift and alignment labels.
    """
    client = db.get_client(client_id)
    if not client:
        raise ValueError(f"Client '{client_id}' not found")

    holdings = db.get_holdings(client_id)

    enriched = []
    for h in holdings:
        current = h["current_value_chf"] or 0
        target = h["target_value_chf"] or 0
        drift_pct = ((current - target) / target * 100) if target else 0

        # CIO alignment label
        rating = (h.get("cio_rating") or "").upper()
        if rating == "BUY":
            cio_label = "Aligned"
        elif rating == "HOLD":
            cio_label = "Neutral"
        elif rating == "SELL":
            cio_label = "Conflict"
        else:
            cio_label = "Unknown"

        if rating == "SELL":
            allocation_status = "SELL"
        elif drift_pct > 5:
            allocation_status = "Overweight"
        elif drift_pct < -5:
            allocation_status = "Underweight"
        else:
            allocation_status = "On Target"

        enriched.append({
            **h,
            "drift_pct": round(drift_pct, 1),
            "cio_alignment": cio_label,
            "allocation_status": allocation_status,
            "personal_alignment": "Pending"  # filled by reasoning agent
        })

    total_value = sum(h["current_value_chf"] or 0 for h in holdings)

    return {
        "client_id": client_id,
        "client_name": client["name"],
        "strategy": client["strategy"],
        "total_value_chf": total_value,
        "holdings": enriched
    }


def find_replacement(
    holding: dict,
    client_dna: dict,
    mandate: str
) -> dict | None:
    """
    Find a CIO-approved replacement in the same sector that doesn't
    conflict with client DNA. Never lets the LLM invent a stock.
    """
    from services.llm_service import call_llm_json

    sector = holding.get("sector")
    cio_recs = db.get_cio_recs(sector=sector, mandate=mandate)

    # Filter: BUY or HOLD only, exclude the current holding
    candidates = [
        r for r in cio_recs
        if r["rating"] in ("BUY", "HOLD")
        and r["issuer"] != holding["issuer"]
    ]

    if not candidates:
        return None

    if len(candidates) == 1:
        best = candidates[0]
    else:
        # Ask LLM to rank by client DNA fit
        prompt = f"""
You are a portfolio advisor. A client needs a replacement holding.

Client DNA summary:
- Values: {client_dna.get('values', [])}
- Avoid: {client_dna.get('avoid', [])}
- Red flags: {client_dna.get('red_flags', [])}
- Strategy: {mandate}

Current holding to replace: {holding['issuer']} ({sector})

Approved CIO candidates (all are pre-approved, BUY or HOLD rated):
{[c['issuer'] + ' - ' + c.get('comment','') for c in candidates]}

Return JSON:
{{
  "best_replacement": "<issuer name from the list above ONLY>",
  "reason": "<one sentence explaining the fit>"
}}

IMPORTANT: Only pick from the candidates list. Do not suggest any other company.
"""
        result = call_llm_json(prompt)
        best_name = result.get("best_replacement", "")
        best = next((c for c in candidates if c["issuer"] == best_name), candidates[0])

    return {
        "sell": holding["issuer"],
        "buy": best["issuer"],
        "sector": sector,
        "cio_rating": best["rating"],
        "reason": best.get("comment", "Same sector, CIO-approved")
    }
