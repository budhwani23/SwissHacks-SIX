"""
voice_agent.py - turns a spoken transcript into a structured UI command.

Uses the existing Phoeniqs gpt-oss model (services.llm_service.call_llm_json)
to map free-form speech onto a closed set of actions the frontend can execute.
"""
import json
from services.llm_service import call_llm_json

ACTIONS = [
    "open_client",       # open a specific client (target_client_id) or highest priority
    "next_client",       # move to the next client in the priority list
    "prev_client",       # move to the previous client
    "show_tab",          # switch the detail tab (alerts | portfolio | dna)
    "read_alerts",       # switch to alerts and read them aloud
    "read_portfolio",    # switch to portfolio and read it aloud
    "read_dna",          # switch to client DNA and read it aloud
    "read_summary",      # read a short summary of the current/target client
    "start_briefing",    # open highest priority (or target) and narrate summary->alerts->portfolio->dna
    "open_constellation",# open the trust constellation overlay
    "run_analysis",      # run portfolio analysis for all clients
    "go_home",           # return to the landing/home screen
    "generate_note",     # draft an advisory message for the current client & alert
    "download_pdf",      # download the PDF report for the current client
    "unknown",           # could not map to a command
]

SYSTEM = """You are the command parser for "SIXgnals", a private-banking relationship CRM.
Convert the user's spoken request into ONE JSON command the app can execute.

Return ONLY a JSON object with these keys:
- "action": one of {actions}
- "target_client_id": the id of the client the command refers to, or null.
    Resolve names, "highest priority"/"top"/"first" (= the first client in the provided list),
    "next"/"previous". Use null when no specific client is implied.
- "tab": one of "alerts","portfolio","dna" when relevant (for show_tab), else null.
- "speak": a short, natural one-sentence confirmation to say back to the user.

Rules:
- "open the highest priority customer/client" -> action "open_client", target_client_id = the FIRST client's id.
- "show/read alerts" -> "read_alerts"; "portfolio" -> "read_portfolio"; "client dna"/"dna"/"profile" -> "read_dna".
- "give me a briefing" / "walk me through" / "brief me on X" -> "start_briefing".
- "next client" -> "next_client"; "previous"/"go back a client" -> "prev_client".
- "open the constellation"/"trust map" -> "open_constellation".
- "run analysis"/"scan portfolios" -> "run_analysis".
- "go home"/"back to start" -> "go_home".
- "generate note"/"draft advisory"/"write a message"/"prepare a note"/"draft email" -> "generate_note".
- "download pdf"/"download report"/"save report"/"export pdf"/"print report" -> "download_pdf".
- If unclear, use action "unknown" and a helpful "speak" asking them to rephrase.
Output JSON only, no prose, no markdown.""".replace("{actions}", ", ".join(ACTIONS))


def interpret(transcript: str, clients: list = None, current_client_id: str = None,
              current_tab: str = None) -> dict:
    """Return a structured command dict for the given transcript."""
    clients = clients or []
    # Compact, priority-ordered context the model can resolve against.
    ctx_clients = [
        {
            "rank": i + 1,
            "id": c.get("id"),
            "name": c.get("name"),
            "open_alerts": c.get("open_alerts", 0),
            "high_severity_alerts": c.get("high_severity_alerts", 0),
        }
        for i, c in enumerate(clients)
    ]
    prompt = json.dumps({
        "transcript": transcript,
        "clients_by_priority": ctx_clients,
        "current_client_id": current_client_id,
        "current_tab": current_tab,
    }, ensure_ascii=False)

    try:
        result = call_llm_json(prompt, system=SYSTEM)
    except Exception as e:
        return {"action": "unknown", "target_client_id": None, "tab": None,
                "speak": "Sorry, I could not process that. Please try again.",
                "error": str(e)}

    # Normalise / guard the shape.
    action = result.get("action", "unknown")
    if action not in ACTIONS:
        action = "unknown"
    return {
        "action": action,
        "target_client_id": result.get("target_client_id"),
        "tab": result.get("tab"),
        "speak": result.get("speak") or "",
        "transcript": transcript,
    }
