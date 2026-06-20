"""
excel_loader.py - Load SwissHacks Excel files into the database.

Drop the real files into backend/data/ and run:
    python -m services.excel_loader

Until the real files arrive, seed_mock_data() populates the DB with
realistic mock data matching the expected schema.
"""
import json
import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
CRM_FILE = DATA_DIR / "SwissHacks CRM.xlsx"
PORTFOLIO_FILE = DATA_DIR / "SwissHacks Portfolio Construction.xlsx"


# ─── Mock data (used when Excel files are absent) ───────────────────────────

MOCK_CLIENTS = [
    {
        "id": "schneider",
        "name": "Schneider",
        "strategy": "Balanced",
        "crm_notes": [
            {
                "date": "2024-09-15",
                "note": "Client's daughter was diagnosed with Parkinson's disease last year. "
                        "The family has established a foundation dedicated to Parkinson's research "
                        "and funding clinical trials. Client is deeply emotionally invested and wants "
                        "the portfolio to reflect these values. Specifically asked to avoid any company "
                        "that is retreating from neurodegenerative disease research."
            },
            {
                "date": "2024-11-02",
                "note": "Regular review. Client reaffirmed commitment to healthcare innovation theme. "
                        "Comfortable with balanced risk, but very sensitive to reputational conflicts. "
                        "Prefers personalised, values-driven communication. Dislikes jargon."
            }
        ]
    },
    {
        "id": "huber",
        "name": "Huber",
        "strategy": "Defensive",
        "crm_notes": [
            {
                "date": "2024-08-20",
                "note": "Client runs a mid-size consumer goods distribution company. "
                        "Strong personal commitment to sustainability and supply chain ethics. "
                        "Concerned about deforestation and palm oil sourcing. Prefers ESG-screened holdings. "
                        "Would like to be alerted to positive ESG developments in portfolio companies too."
            }
        ]
    },
    {
        "id": "raeber",
        "name": "Räber",
        "strategy": "Defensive",
        "crm_notes": [
            {
                "date": "2024-10-10",
                "note": "Retired CFO. Primary goal is capital preservation. Extremely risk-averse. "
                        "Concerned about any CIO downgrades on current holdings. "
                        "Wants proactive notification before any mandated rebalancing. "
                        "Communication style: analytical, precise, minimal emotion."
            }
        ]
    },
    {
        "id": "ammann",
        "name": "Ammann",
        "strategy": "Growth",
        "crm_notes": [
            {
                "date": "2024-12-01",
                "note": "Entrepreneur, recently exited tech startup. High risk tolerance for growth. "
                        "Reputation is very important – family name is publicly associated with a charitable foundation. "
                        "Wants strict exclusion of companies involved in labour exploitation or major governance scandals. "
                        "Interested in AI and semiconductor sector opportunities."
            }
        ]
    }
]

MOCK_HOLDINGS = {
    "schneider": [
        {"issuer": "Roche", "sector": "Healthcare", "valor": "1203211", "mic": "XSWX", "current_value_chf": 850000, "target_value_chf": 800000, "cio_rating": "BUY"},
        {"issuer": "Novartis", "sector": "Healthcare", "valor": "1200526", "mic": "XSWX", "current_value_chf": 600000, "target_value_chf": 600000, "cio_rating": "HOLD"},
        {"issuer": "PharmaX AG", "sector": "Healthcare", "valor": "9900001", "mic": "XSWX", "current_value_chf": 400000, "target_value_chf": 450000, "cio_rating": "HOLD"},
        {"issuer": "Zurich Insurance", "sector": "Financials", "valor": "1107539", "mic": "XSWX", "current_value_chf": 300000, "target_value_chf": 300000, "cio_rating": "HOLD"},
        {"issuer": "Nestlé", "sector": "Consumer Staples", "valor": "3886335", "mic": "XSWX", "current_value_chf": 250000, "target_value_chf": 250000, "cio_rating": "HOLD"},
    ],
    "huber": [
        {"issuer": "Nestlé", "sector": "Consumer Staples", "valor": "3886335", "mic": "XSWX", "current_value_chf": 700000, "target_value_chf": 700000, "cio_rating": "HOLD"},
        {"issuer": "ABB", "sector": "Industrials", "valor": "1222171", "mic": "XSWX", "current_value_chf": 500000, "target_value_chf": 500000, "cio_rating": "BUY"},
        {"issuer": "Sika AG", "sector": "Materials", "valor": "400030", "mic": "XSWX", "current_value_chf": 400000, "target_value_chf": 400000, "cio_rating": "BUY"},
        {"issuer": "SGS SA", "sector": "Industrials", "valor": "249745", "mic": "XSWX", "current_value_chf": 300000, "target_value_chf": 300000, "cio_rating": "HOLD"},
    ],
    "raeber": [
        {"issuer": "Swiss Re", "sector": "Financials", "valor": "1213853", "mic": "XSWX", "current_value_chf": 900000, "target_value_chf": 900000, "cio_rating": "HOLD"},
        {"issuer": "Swisscom", "sector": "Telecoms", "valor": "874251", "mic": "XSWX", "current_value_chf": 600000, "target_value_chf": 600000, "cio_rating": "HOLD"},
        {"issuer": "Swiss Life", "sector": "Financials", "valor": "1485278", "mic": "XSWX", "current_value_chf": 500000, "target_value_chf": 500000, "cio_rating": "SELL"},
    ],
    "ammann": [
        {"issuer": "NVIDIA", "sector": "Technology", "valor": "US67066G1040", "mic": "XNAS", "current_value_chf": 1200000, "target_value_chf": 1000000, "cio_rating": "BUY"},
        {"issuer": "ASML", "sector": "Technology", "valor": "NL0010273215", "mic": "XAMS", "current_value_chf": 800000, "target_value_chf": 800000, "cio_rating": "BUY"},
        {"issuer": "GlobalLogistics Corp", "sector": "Industrials", "valor": "9900099", "mic": "XNYS", "current_value_chf": 400000, "target_value_chf": 500000, "cio_rating": "HOLD"},
    ]
}

MOCK_CIO_RECS = [
    {"issuer": "Roche", "sector": "Healthcare", "rating": "BUY", "mandate": "All", "comment": "Strong pipeline, Parkinson & oncology focus"},
    {"issuer": "Novartis", "sector": "Healthcare", "rating": "HOLD", "mandate": "All", "comment": "Stable earnings"},
    {"issuer": "Lonza Group", "sector": "Healthcare", "rating": "BUY", "mandate": "Balanced", "comment": "Biotech CDMO, growing"},
    {"issuer": "Nestlé", "sector": "Consumer Staples", "rating": "HOLD", "mandate": "Defensive", "comment": "Defensive, dividend payer"},
    {"issuer": "Givaudan", "sector": "Consumer Staples", "rating": "BUY", "mandate": "Balanced", "comment": "Premium ESG consumer brand"},
    {"issuer": "ABB", "sector": "Industrials", "rating": "BUY", "mandate": "All", "comment": "Electrification leader"},
    {"issuer": "Sika AG", "sector": "Materials", "rating": "BUY", "mandate": "All", "comment": "Construction materials, ESG leader"},
    {"issuer": "Swiss Re", "sector": "Financials", "rating": "HOLD", "mandate": "Defensive", "comment": "Reinsurance, stable"},
    {"issuer": "Zurich Insurance", "sector": "Financials", "rating": "HOLD", "mandate": "All", "comment": "Diversified insurer"},
    {"issuer": "Swisscom", "sector": "Telecoms", "rating": "HOLD", "mandate": "Defensive", "comment": "Monopoly, dividend"},
    {"issuer": "NVIDIA", "sector": "Technology", "rating": "BUY", "mandate": "Growth", "comment": "AI infrastructure leader"},
    {"issuer": "ASML", "sector": "Technology", "rating": "BUY", "mandate": "Growth", "comment": "Semiconductor equipment monopoly"},
    {"issuer": "Logitech", "sector": "Technology", "rating": "HOLD", "mandate": "Balanced", "comment": "Solid but slowing"},
]


def seed_mock_data():
    """Populate DB from mock data. Safe to run multiple times (skips existing)."""
    from database import get_conn

    conn = get_conn()

    # clients
    for c in MOCK_CLIENTS:
        existing = conn.execute("SELECT id FROM clients WHERE id=?", (c["id"],)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO clients (id, name, strategy) VALUES (?,?,?)",
                (c["id"], c["name"], c["strategy"])
            )
            for note in c["crm_notes"]:
                conn.execute(
                    "INSERT INTO crm_notes (client_id, date, note) VALUES (?,?,?)",
                    (c["id"], note["date"], note["note"])
                )

    # holdings
    for client_id, holdings in MOCK_HOLDINGS.items():
        existing = conn.execute("SELECT id FROM holdings WHERE client_id=?", (client_id,)).fetchone()
        if not existing:
            for h in holdings:
                conn.execute(
                    """INSERT INTO holdings
                       (client_id, issuer, sector, valor, mic, current_value_chf, target_value_chf, cio_rating)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (client_id, h["issuer"], h["sector"], h["valor"], h["mic"],
                     h["current_value_chf"], h["target_value_chf"], h["cio_rating"])
                )

    # CIO recs
    existing_recs = conn.execute("SELECT COUNT(*) FROM cio_recommendations").fetchone()[0]
    if existing_recs == 0:
        for r in MOCK_CIO_RECS:
            conn.execute(
                "INSERT INTO cio_recommendations (issuer, sector, rating, mandate, comment) VALUES (?,?,?,?,?)",
                (r["issuer"], r["sector"], r["rating"], r["mandate"], r["comment"])
            )

    conn.commit()
    conn.close()
    print("✓ Mock data seeded")


def load_from_excel():
    """
    Load real SwissHacks Excel files if present.
    Falls back to mock data if files are missing.
    """
    if not CRM_FILE.exists() or not PORTFOLIO_FILE.exists():
        print("Excel files not found – using mock data")
        seed_mock_data()
        return

    import pandas as pd
    from database import get_conn

    conn = get_conn()
    crm_sheets = pd.read_excel(CRM_FILE, sheet_name=None)
    portfolio_sheets = pd.read_excel(PORTFOLIO_FILE, sheet_name=None)

    # TODO: Map real sheet/column names once files are available.
    # Expected CRM columns: Client, Date, Note
    # Expected Portfolio columns: Issuer, Sector, Valor, MIC, Current CHF, Target CHF, Rating
    print("Excel files found – implement column mapping here")
    conn.close()


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from database import init_db
    init_db()
    load_from_excel()
