"""
main.py - FastAPI application entry point

Run with:
    uvicorn main:app --reload --port 8000

API docs at: http://localhost:8000/docs
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json

import database as db
from services.excel_loader import load_from_excel
from services.news_service import load_mock_news
from agents import crm_agent, portfolio_agent, news_agent, reasoning_agent, message_agent


# ─── Startup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initialising database...")
    db.init_db()
    db.reset_transient_data()
    print("Loading data (Excel or mock)...")
    load_from_excel()
    print("Loading mock news triggers...")
    load_mock_news()
    print("✓ SwissHacks CRM backend ready")
    yield


app = FastAPI(
    title="SwissHacks CRM Intelligence API",
    version="1.0.0",
    description="AI-powered RM advisory system for Swiss private banking",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request models ───────────────────────────────────────────────────────────

class GenerateMessageRequest(BaseModel):
    alert_id: int
    tone: Optional[str] = "values-led"  # analytical | values-led | concise | detailed


class AlertStatusRequest(BaseModel):
    status: str  # open | dismissed | escalated | actioned


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "SwissHacks CRM Intelligence API", "docs": "/docs"}


# ── Clients ──

@app.get("/clients")
def list_clients():
    """
    Returns all clients with a summary of open alerts.
    """
    clients = db.get_all_clients()
    result = []
    for c in clients:
        alerts = db.get_alerts(c["id"])
        open_alerts = [a for a in alerts if a["status"] == "open"]
        high_severity = [a for a in open_alerts if a["severity"] == "High"]

        dna = {}
        if c.get("dna_json"):
            try:
                dna = json.loads(c["dna_json"])
            except Exception:
                pass

        result.append({
            "id": c["id"],
            "name": c["name"],
            "strategy": c["strategy"],
            "personal_theme": ", ".join(dna.get("values", [])[:2]) if dna else None,
            "open_alerts": len(open_alerts),
            "high_severity_alerts": len(high_severity),
            "alert_label": "Critical" if len(high_severity) >= 2
                           else "High" if len(high_severity) == 1
                           else "Medium" if len(open_alerts) > 0
                           else "Clear"
        })

    return result


@app.get("/clients/{client_id}")
def get_client(client_id: str):
    client = db.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


# ── Client DNA ──

@app.get("/clients/{client_id}/dna")
def get_dna(client_id: str, refresh: bool = False):
    """
    Returns extracted Client DNA. Cached after first call.
    Pass ?refresh=true to force re-extraction.
    """
    try:
        dna = crm_agent.extract_client_dna(client_id, force_refresh=refresh)
        notes = db.get_crm_notes(client_id)
        return {
            "dna": dna,
            "source_notes": notes
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DNA extraction failed: {e}")


# ── Portfolio ──

@app.get("/clients/{client_id}/portfolio")
def get_portfolio(client_id: str):
    """
    Returns client holdings enriched with drift and CIO alignment labels.
    """
    try:
        return portfolio_agent.get_client_portfolio(client_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Alerts ──

@app.get("/clients/{client_id}/alerts")
def get_client_alerts(client_id: str):
    """Returns all alerts for a client."""
    client = db.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return db.get_alerts(client_id)


@app.get("/alerts")
def get_all_alerts():
    """Returns all alerts across all clients."""
    return db.get_all_alerts()


@app.delete("/alerts")
def clear_all_alerts():
    """Delete all alerts and generated messages from the database."""
    with db.get_conn() as conn:
        conn.execute("DELETE FROM generated_messages")
        conn.execute("DELETE FROM alerts")
        conn.commit()
    return {"ok": True, "message": "All alerts and messages cleared"}


@app.patch("/alerts/{alert_id}/status")
def update_alert_status(alert_id: int, body: AlertStatusRequest):
    """Update alert status: open | dismissed | escalated | actioned"""
    valid_statuses = {"open", "dismissed", "escalated", "actioned"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid_statuses}")
    db.update_alert_status(alert_id, body.status)
    return {"ok": True, "alert_id": alert_id, "status": body.status}


@app.post("/alerts/run-analysis")
def run_analysis(min_score: int = 30):
    """
    Runs the full reasoning pipeline for all clients.
    Matches news events against holdings and client DNA.
    Returns generated alerts by client.
    """
    results = reasoning_agent.run_analysis_for_all_clients(min_score=min_score)
    total = sum(len(v) for v in results.values())
    return {
        "total_alerts_created": total,
        "by_client": {k: len(v) for k, v in results.items()},
        "alerts": results
    }


@app.post("/clients/{client_id}/run-analysis")
def run_client_analysis(client_id: str, min_score: int = 30):
    """Run reasoning pipeline for one specific client."""
    client = db.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    alerts = reasoning_agent.run_analysis_for_client(client_id, min_score=min_score)
    return {"alerts_created": len(alerts), "alerts": alerts}


# ── Message Generation ──

@app.post("/clients/{client_id}/generate-message")
def generate_message(client_id: str, body: GenerateMessageRequest):
    """
    Generates a draft RM advisory message for a specific alert.
    Tone: analytical | values-led | concise | detailed
    """
    client = db.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    try:
        result = message_agent.generate_message(
            client_id=client_id,
            alert_id=body.alert_id,
            tone=body.tone
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Message generation failed: {e}")


@app.get("/clients/{client_id}/messages")
def get_messages(client_id: str):
    """Returns all generated messages for a client."""
    client = db.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return db.get_messages(client_id)


@app.post("/messages/{message_id}/approve")
def approve_message(message_id: int):
    """Mark a generated message as approved by RM."""
    db.approve_message(message_id)
    return {"ok": True, "message_id": message_id, "approved": True}


# ── News ──

@app.get("/news")
def get_news():
    """Returns all news events in the system."""
    return news_agent.get_all_news()


@app.post("/news/refresh")
def refresh_news(live: bool = True, companies: Optional[str] = None):
    """
    Reload news into DB.
    - live=false (default): loads mock_news.json
    - live=true: fetches from Event Registry (requires API key + companies param)
    - companies: comma-separated list e.g. "Roche,Novartis"
    """
    if live and companies:
        company_list = [c.strip() for c in companies.split(",")]
        inserted = news_agent.refresh_live_news(company_list)
    else:
        inserted = news_agent.refresh_mock_news()
    return {"inserted": len(inserted), "events": inserted}


# ── CIO Recommendations ──

@app.get("/cio-recommendations")
def get_cio_recs(sector: Optional[str] = None, mandate: Optional[str] = None):
    """Returns CIO-approved universe, optionally filtered by sector/mandate."""
    return db.get_cio_recs(sector=sector, mandate=mandate)


# ── Replacement finder ──

@app.get("/clients/{client_id}/replacement")
def find_replacement(client_id: str, issuer: str):
    """
    Suggests a CIO-approved replacement for a holding that has a conflict.
    """
    client = db.get_client(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    holdings = db.get_holdings(client_id)
    holding = next((h for h in holdings if h["issuer"] == issuer), None)
    if not holding:
        raise HTTPException(status_code=404, detail=f"Holding '{issuer}' not found")

    try:
        dna = crm_agent.extract_client_dna(client_id)
    except Exception:
        dna = {}

    replacement = portfolio_agent.find_replacement(holding, dna, client["strategy"])
    if not replacement:
        return {"message": "No CIO-approved replacement found in same sector"}

    return replacement
