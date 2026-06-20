"""
excel_loader.py - Parse SwissHacks Excel files into normalized SQLite tables.

Drop the real files into backend/data/ and call load_from_excel().
Falls back to mock data if files are absent.

CRM file sheet names   : one tab per client (e.g. "CRM Schneider", "CRM Huber", ...)
Portfolio file sheets  : "Sample Portfolio Defensive", "Sample Portfolio Balanced",
                         "Sample Portfolio Growth", "CIO Recommendation List",
                         "Transactions" (or similar)
"""
import json
import sqlite3
from pathlib import Path

BACKEND_DIR    = Path(__file__).parent.parent
CRM_FILE       = Path("SwissHacks CRM.xlsx")
PORTFOLIO_FILE = Path("SwissHacks Portfolio Construction.xlsx")
print(PORTFOLIO_FILE.exists(), CRM_FILE.exists())
# ─── Client ID mapping ────────────────────────────────────────────────────────
# Maps any sheet/tab name containing one of these keywords → our client id
CLIENT_KEYWORD_MAP = {
    "schneider": "schneider",
    "huber":     "huber",
    "raeber":    "raeber",
    "räber":     "raeber",
    "raber":     "raeber",
    "ammann":    "ammann",
}

# Maps client id → mandate
CLIENT_STRATEGY_MAP = {
    "schneider": "Balanced",
    "huber":     "Defensive",
    "raeber":    "Defensive",
    "ammann":    "Growth",
}

CLIENT_NAMES = {
    "schneider": "Schneider",
    "huber":     "Huber",
    "raeber":    "Räber",
    "ammann":    "Ammann",
}

# Maps mandate → portfolio sheet keyword
MANDATE_SHEET_MAP = {
    "Defensive": "defensive",
    "Balanced":  "balanced",
    "Growth":    "growth",
}


# ─── Column name normaliser ───────────────────────────────────────────────────

def _col(df, *candidates):
    """Return first column name from df that matches any candidate (case-insensitive)."""
    cols_lower = {c.lower().strip(): c for c in df.columns}
    for cand in candidates:
        match = cols_lower.get(cand.lower().strip())
        if match:
            return match
    return None


def _val(row, *candidates):
    """Return first non-null value from row matching candidate column names."""
    for cand in candidates:
        v = row.get(cand)
        if v is not None and str(v).strip() not in ("", "nan", "NaN", "None"):
            return v
    return None


# ─── CRM Excel parser ─────────────────────────────────────────────────────────

def _load_crm(conn):
    import pandas as pd

    sheets = pd.read_excel(CRM_FILE, sheet_name=None, header=0)
    loaded = 0

    for sheet_name, df in sheets.items():
        # Identify client from sheet name
        sheet_lower = sheet_name.lower()
        client_id = None
        for keyword, cid in CLIENT_KEYWORD_MAP.items():
            if keyword in sheet_lower:
                client_id = cid
                break
        if not client_id:
            continue

        # Upsert client row
        existing = conn.execute("SELECT id FROM clients WHERE id=?", (client_id,)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO clients (id, name, strategy) VALUES (?,?,?)",
                (client_id, CLIENT_NAMES[client_id], CLIENT_STRATEGY_MAP[client_id])
            )

        # Find date and note columns (try common names)
        df.columns = [str(c).strip() for c in df.columns]
        date_col = _col(df, "date", "Date", "datum", "Datum", "meeting date", "Meeting Date")
        note_col = _col(df, "note", "Note", "notes", "Notes", "comment", "Comment",
                        "remarks", "Remarks", "interaction", "Interaction", "text", "Text",
                        "conversation", "Conversation", "log", "Log")

        if not note_col:
            # Fallback: use the largest text column
            text_cols = df.select_dtypes(include="object").columns.tolist()
            if text_cols:
                note_col = max(text_cols, key=lambda c: df[c].astype(str).str.len().mean())

        for _, row in df.iterrows():
            row = row.to_dict()
            note = str(row.get(note_col, "")).strip() if note_col else ""
            if not note or note.lower() in ("nan", "none", ""):
                continue
            date = str(row.get(date_col, "")).strip() if date_col else ""
            if date.lower() in ("nan", "none", "nat"):
                date = ""

            conn.execute(
                "INSERT INTO crm_notes (client_id, date, note) VALUES (?,?,?)",
                (client_id, date, note)
            )
            loaded += 1

    conn.commit()
    print(f"✓ CRM: loaded {loaded} notes across {len(CLIENT_NAMES)} clients")


# ─── Portfolio Excel parser ───────────────────────────────────────────────────

def _load_portfolio(conn):
    import pandas as pd

    sheets = pd.read_excel(PORTFOLIO_FILE, sheet_name=None, header=0)
    holdings_loaded = 0
    cio_loaded = 0
    tx_loaded = 0

    for sheet_name, df in sheets.items():
        sheet_lower = sheet_name.lower().strip()
        df.columns = [str(c).strip() for c in df.columns]
        df = df.dropna(how="all")

        # ── Portfolio holdings sheets ──────────────────────────────────────────
        mandate = None
        for m, keyword in MANDATE_SHEET_MAP.items():
            if keyword in sheet_lower and "portfolio" in sheet_lower:
                mandate = m
                break

        if mandate:
            # Find client(s) with this mandate
            clients_for_mandate = [cid for cid, s in CLIENT_STRATEGY_MAP.items() if s == mandate]

            issuer_col   = _col(df, "issuer", "name", "company", "instrument", "security", "beschreibung")
            isin_col     = _col(df, "isin", "ISIN")
            sector_col   = _col(df, "sector", "Sector", "sektor", "asset class", "sub asset class")
            valor_col    = _col(df, "valor", "Valor", "valorennummer")
            mic_col      = _col(df, "mic", "MIC", "exchange", "börse")
            yahoo_col    = _col(df, "yahoo", "yahoo ticker", "ticker")
            current_col  = _col(df, "current", "current (chf)", "current chf", "market value", "marktwert", "current value")
            target_col   = _col(df, "target", "target (chf)", "target chf", "zielwert", "target value")
            qty_col      = _col(df, "quantity", "qty", "menge", "anzahl", "units", "face value")
            rating_col   = _col(df, "rating", "cio rating", "recommendation", "empfehlung")

            for _, row in df.iterrows():
                row = row.to_dict()
                issuer = str(_val(row, issuer_col) or "").strip()
                if not issuer or issuer.lower() in ("nan", "none", "total", ""):
                    continue

                current_chf = _val(row, current_col)
                target_chf  = _val(row, target_col)
                try:
                    current_chf = float(str(current_chf).replace(",", "").replace("'", "")) if current_chf else None
                except Exception:
                    current_chf = None
                try:
                    target_chf = float(str(target_chf).replace(",", "").replace("'", "")) if target_chf else None
                except Exception:
                    target_chf = None

                for client_id in clients_for_mandate:
                    existing = conn.execute("SELECT id FROM clients WHERE id=?", (client_id,)).fetchone()
                    if not existing:
                        conn.execute(
                            "INSERT INTO clients (id, name, strategy) VALUES (?,?,?)",
                            (client_id, CLIENT_NAMES[client_id], CLIENT_STRATEGY_MAP[client_id])
                        )
                    conn.execute(
                        """INSERT INTO holdings
                           (client_id, issuer, isin, sector, valor, mic, yahoo_ticker,
                            current_value_chf, target_value_chf, cio_rating)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (
                            client_id,
                            issuer,
                            str(_val(row, isin_col) or ""),
                            str(_val(row, sector_col) or ""),
                            str(_val(row, valor_col) or ""),
                            str(_val(row, mic_col) or ""),
                            str(_val(row, yahoo_col) or ""),
                            current_chf,
                            target_chf,
                            str(_val(row, rating_col) or ""),
                        )
                    )
                    holdings_loaded += 1

        # ── CIO Recommendation List ────────────────────────────────────────────
        elif "cio" in sheet_lower and ("rec" in sheet_lower or "recommendation" in sheet_lower):
            issuer_col  = _col(df, "issuer", "name", "company", "instrument", "security")
            isin_col    = _col(df, "isin", "ISIN")
            sector_col  = _col(df, "sector", "Sector")
            rating_col  = _col(df, "rating", "cio rating", "recommendation", "action")
            mandate_col = _col(df, "mandate", "strategy", "portfolio")
            swap_col    = _col(df, "swap", "swap candidate", "alternative", "replacement")
            comment_col = _col(df, "comment", "comments", "rationale", "reason", "note")

            for _, row in df.iterrows():
                row = row.to_dict()
                issuer = str(_val(row, issuer_col) or "").strip()
                rating = str(_val(row, rating_col) or "").strip().upper()
                if not issuer or issuer.lower() in ("nan", "none", ""):
                    continue
                if rating not in ("BUY", "HOLD", "SELL"):
                    continue
                conn.execute(
                    """INSERT INTO cio_recommendations
                       (issuer, isin, sector, rating, mandate, swap_candidate, comment)
                       VALUES (?,?,?,?,?,?,?)""",
                    (
                        issuer,
                        str(_val(row, isin_col) or ""),
                        str(_val(row, sector_col) or ""),
                        rating,
                        str(_val(row, mandate_col) or "All"),
                        str(_val(row, swap_col) or ""),
                        str(_val(row, comment_col) or ""),
                    )
                )
                cio_loaded += 1

        # ── Transaction History ────────────────────────────────────────────────
        elif "transact" in sheet_lower or "history" in sheet_lower:
            client_col  = _col(df, "client", "client id", "client name", "kunde")
            date_col    = _col(df, "date", "datum", "trade date", "settlement date")
            isin_col    = _col(df, "isin", "ISIN")
            issuer_col  = _col(df, "issuer", "name", "company", "instrument")
            action_col  = _col(df, "action", "type", "buy/sell", "transaction type", "buysell")
            qty_col     = _col(df, "quantity", "qty", "menge", "units", "amount")
            price_col   = _col(df, "price", "preis", "kurs")
            value_col   = _col(df, "value", "value chf", "total", "betrag", "consideration")

            for _, row in df.iterrows():
                row = row.to_dict()
                isin = str(_val(row, isin_col) or "").strip()
                if not isin or isin.lower() in ("nan", "none", ""):
                    continue

                # Resolve client_id from client column or default all
                raw_client = str(_val(row, client_col) or "").lower()
                client_id = None
                for keyword, cid in CLIENT_KEYWORD_MAP.items():
                    if keyword in raw_client:
                        client_id = cid
                        break
                if not client_id:
                    continue

                try:
                    qty   = float(str(_val(row, qty_col) or 0).replace(",", ""))
                    price = float(str(_val(row, price_col) or 0).replace(",", ""))
                    value = float(str(_val(row, value_col) or 0).replace(",", "").replace("'", ""))
                except Exception:
                    qty = price = value = 0

                conn.execute(
                    """INSERT INTO transactions
                       (client_id, date, isin, issuer, action, quantity, price, value_chf)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (
                        client_id,
                        str(_val(row, date_col) or ""),
                        isin,
                        str(_val(row, issuer_col) or ""),
                        str(_val(row, action_col) or "").upper(),
                        qty, price, value,
                    )
                )
                tx_loaded += 1

    conn.commit()
    print(f"✓ Portfolio: {holdings_loaded} holdings, {cio_loaded} CIO recs, {tx_loaded} transactions")


# ─── Mock data (fallback when Excel files absent) ────────────────────────────

MOCK_CLIENTS = [
    {"id": "schneider", "name": "Schneider", "strategy": "Balanced",  "crm_notes": [
        {"date": "2024-09-15", "note": "Client's daughter was diagnosed with Parkinson's disease last year. The family has established a foundation dedicated to Parkinson's research and funding clinical trials. Client is deeply emotionally invested and wants the portfolio to reflect these values. Specifically asked to avoid any company that is retreating from neurodegenerative disease research."},
        {"date": "2024-11-02", "note": "Regular review. Client reaffirmed commitment to healthcare innovation theme. Comfortable with balanced risk, but very sensitive to reputational conflicts. Prefers personalised, values-driven communication. Dislikes jargon."},
        {"date": "2025-01-15", "note": "Client mentioned the foundation received a grant. Very pleased with Roche's recent Parkinson pipeline announcement. Asked to increase healthcare exposure if CIO-approved opportunities arise."},
    ]},
    {"id": "huber", "name": "Huber", "strategy": "Defensive", "crm_notes": [
        {"date": "2024-08-20", "note": "Client runs a mid-size consumer goods distribution company. Strong personal commitment to sustainability and supply chain ethics. Concerned about deforestation and palm oil sourcing. Prefers ESG-screened holdings. Would like to be alerted to positive ESG developments in portfolio companies too."},
        {"date": "2024-12-10", "note": "Huber reviewed Q3 sustainability report. Pleased with Sika's carbon milestone. Concerned about Nestlé palm oil exposure — asked RM to monitor. Communication style: factual, data-driven, brief."},
    ]},
    {"id": "raeber", "name": "Räber", "strategy": "Defensive", "crm_notes": [
        {"date": "2024-10-10", "note": "Retired CFO. Primary goal is capital preservation. Extremely risk-averse. Concerned about any CIO downgrades on current holdings. Wants proactive notification before any mandated rebalancing. Communication style: analytical, precise, minimal emotion. Strongly opposed to US technology and AI stocks — considers them too speculative for a defensive mandate."},
        {"date": "2025-02-05", "note": "Räber called in to ask about rebalancing rumours. Reminded RM that they do not want any allocation to AI or growth-oriented US tech. Prefers Swiss and European blue-chip dividend payers."},
    ]},
    {"id": "ammann", "name": "Ammann", "strategy": "Growth", "crm_notes": [
        {"date": "2024-12-01", "note": "Entrepreneur, recently exited tech startup. High risk tolerance for growth. Reputation is very important — family name is publicly associated with a charitable foundation. Wants strict exclusion of companies involved in labour exploitation or major governance scandals. Interested in AI and semiconductor sector opportunities."},
        {"date": "2025-03-10", "note": "Ammann flagged concern about supply chain risks in consumer brands. Reiterated zero tolerance for labour exploitation. Asked to be alerted immediately if any holding faces such scrutiny. Growth mandate but reputation-first filter applies to all positions."},
    ]},
]

MOCK_HOLDINGS = {
    "schneider": [
        {"issuer": "Roche",           "sector": "Healthcare",       "valor": "1203211", "mic": "XSWX", "current_value_chf": 850000,  "target_value_chf": 800000,  "cio_rating": "BUY"},
        {"issuer": "Novartis",        "sector": "Healthcare",       "valor": "1200526", "mic": "XSWX", "current_value_chf": 600000,  "target_value_chf": 600000,  "cio_rating": "HOLD"},
        {"issuer": "PharmaX AG",      "sector": "Healthcare",       "valor": "9900001", "mic": "XSWX", "current_value_chf": 400000,  "target_value_chf": 450000,  "cio_rating": "HOLD"},
        {"issuer": "Zurich Insurance","sector": "Financials",       "valor": "1107539", "mic": "XSWX", "current_value_chf": 300000,  "target_value_chf": 300000,  "cio_rating": "HOLD"},
        {"issuer": "Nestlé",          "sector": "Consumer Staples", "valor": "3886335", "mic": "XSWX", "current_value_chf": 250000,  "target_value_chf": 250000,  "cio_rating": "HOLD"},
    ],
    "huber": [
        {"issuer": "Nestlé",          "sector": "Consumer Staples", "valor": "3886335", "mic": "XSWX", "current_value_chf": 700000,  "target_value_chf": 700000,  "cio_rating": "HOLD"},
        {"issuer": "ABB",             "sector": "Industrials",      "valor": "1222171", "mic": "XSWX", "current_value_chf": 500000,  "target_value_chf": 500000,  "cio_rating": "BUY"},
        {"issuer": "Sika AG",         "sector": "Materials",        "valor": "400030",  "mic": "XSWX", "current_value_chf": 400000,  "target_value_chf": 400000,  "cio_rating": "BUY"},
        {"issuer": "SGS SA",          "sector": "Industrials",      "valor": "249745",  "mic": "XSWX", "current_value_chf": 300000,  "target_value_chf": 300000,  "cio_rating": "HOLD"},
    ],
    "raeber": [
        {"issuer": "Swiss Re",        "sector": "Financials",       "valor": "1213853", "mic": "XSWX", "current_value_chf": 900000,  "target_value_chf": 900000,  "cio_rating": "HOLD"},
        {"issuer": "Swisscom",        "sector": "Telecoms",         "valor": "874251",  "mic": "XSWX", "current_value_chf": 600000,  "target_value_chf": 600000,  "cio_rating": "HOLD"},
        {"issuer": "Swiss Life",      "sector": "Financials",       "valor": "1485278", "mic": "XSWX", "current_value_chf": 500000,  "target_value_chf": 500000,  "cio_rating": "SELL"},
        {"issuer": "Givaudan",        "sector": "Consumer Staples", "valor": "1064593", "mic": "XSWX", "current_value_chf": 400000,  "target_value_chf": 400000,  "cio_rating": "HOLD"},
    ],
    "ammann": [
        {"issuer": "NVIDIA",          "sector": "Technology",       "valor": "US67066G1040", "mic": "XNAS", "current_value_chf": 1200000, "target_value_chf": 1000000, "cio_rating": "BUY"},
        {"issuer": "ASML",            "sector": "Technology",       "valor": "NL0010273215", "mic": "XAMS", "current_value_chf": 800000,  "target_value_chf": 800000,  "cio_rating": "BUY"},
        {"issuer": "GlobalLogistics Corp", "sector": "Industrials", "valor": "9900099", "mic": "XNYS", "current_value_chf": 400000,  "target_value_chf": 500000,  "cio_rating": "HOLD"},
    ],
}

MOCK_CIO_RECS = [
    {"issuer": "Roche",       "sector": "Healthcare",       "rating": "BUY",  "mandate": "All",       "comment": "Strong Parkinson & oncology pipeline"},
    {"issuer": "Novartis",    "sector": "Healthcare",       "rating": "HOLD", "mandate": "All",       "comment": "Stable earnings, diversified portfolio"},
    {"issuer": "Lonza Group", "sector": "Healthcare",       "rating": "BUY",  "mandate": "Balanced",  "comment": "Biotech CDMO, high growth"},
    {"issuer": "Nestlé",      "sector": "Consumer Staples", "rating": "HOLD", "mandate": "Defensive", "comment": "Defensive, dividend payer"},
    {"issuer": "Givaudan",    "sector": "Consumer Staples", "rating": "BUY",  "mandate": "Balanced",  "comment": "Premium ESG consumer brand"},
    {"issuer": "ABB",         "sector": "Industrials",      "rating": "BUY",  "mandate": "All",       "comment": "Electrification leader"},
    {"issuer": "Sika AG",     "sector": "Materials",        "rating": "BUY",  "mandate": "All",       "comment": "ESG construction materials leader"},
    {"issuer": "Swiss Re",    "sector": "Financials",       "rating": "HOLD", "mandate": "Defensive", "comment": "Reinsurance, stable cash flows"},
    {"issuer": "Zurich Insurance", "sector": "Financials",  "rating": "HOLD", "mandate": "All",       "comment": "Diversified insurer, dividend"},
    {"issuer": "Swisscom",    "sector": "Telecoms",         "rating": "HOLD", "mandate": "Defensive", "comment": "Monopoly, high dividend yield"},
    {"issuer": "NVIDIA",      "sector": "Technology",       "rating": "BUY",  "mandate": "Growth",    "comment": "AI infrastructure leader"},
    {"issuer": "ASML",        "sector": "Technology",       "rating": "BUY",  "mandate": "Growth",    "comment": "Semiconductor equipment monopoly"},
    {"issuer": "Logitech",    "sector": "Technology",       "rating": "HOLD", "mandate": "Balanced",  "comment": "Solid but growth slowing"},
]


def seed_mock_data():
    """Populate DB from mock data. Safe to run multiple times."""
    from database import get_conn
    conn = get_conn()

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


# ─── Main entry point ─────────────────────────────────────────────────────────

def load_from_excel():
    """
    Load real Excel files if present, otherwise fall back to mock data.
    Called once at startup.
    """
    if not CRM_FILE.exists() or not PORTFOLIO_FILE.exists():
        missing = []
        if not CRM_FILE.exists():
            missing.append(CRM_FILE.name)
        if not PORTFOLIO_FILE.exists():
            missing.append(PORTFOLIO_FILE.name)
        print(f"Excel files not found ({', '.join(missing)}) — using mock data")
        seed_mock_data()
        return

    from database import get_conn
    conn = get_conn()

    print(f"Loading {CRM_FILE.name}...")
    _load_crm(conn)

    print(f"Loading {PORTFOLIO_FILE.name}...")
    _load_portfolio(conn)

    conn.close()
    print("✓ Excel data loaded")


if __name__ == "__main__":
    import sys
    print(PORTFOLIO_FILE,CRM_FILE)
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from database import init_db
    init_db()
    load_from_excel()
