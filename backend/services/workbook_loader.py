"""Load the supplied SwissHacks workbooks into the existing database schema."""

from pathlib import Path
from services.excel_loader import seed_mock_data

BACKEND_DIR = Path(__file__).parent.parent
PROJECT_DIR = BACKEND_DIR.parent


def _find(name):
    candidates = (BACKEND_DIR / "data" / name, PROJECT_DIR / name)
    return next((path for path in candidates if path.exists()), None)


def load_from_excel():
    crm_file = _find("SwissHacks CRM.xlsx")
    portfolio_file = _find("SwissHacks Portfolio Construction.xlsx")
    if not crm_file or not portfolio_file:
        print("Excel files not found - using mock data")
        seed_mock_data()
        return

    import pandas as pd
    from database import get_conn

    crm_sheets = pd.read_excel(crm_file, sheet_name=None)
    portfolio_sheets = pd.read_excel(portfolio_file, sheet_name=None)
    strategies = {"raeber": "Defensive", "schneider": "Balanced", "huber": "Defensive", "ammann": "Growth"}
    sample_sheet = {"Defensive": "Sample Portfolio Defensive", "Balanced": "Sample Portfolio Balanced", "Growth": "Sample Portfolio Growth"}
    cio = portfolio_sheets["CIO Recommendation List"].fillna("")
    ratings_by_valor = {str(row["Valor"]).replace(".0", ""): row["Rating"] for _, row in cio.iterrows()}
    ratings_by_issuer = {str(row["Issuer / Asset"]): row["Rating"] for _, row in cio.iterrows()}
    mandates_by_issuer = {}
    for mandate, sheet in sample_sheet.items():
        for issuer in portfolio_sheets[sheet]["Issuer / Asset"].dropna().astype(str):
            mandates_by_issuer.setdefault(issuer, set()).add(mandate)

    with get_conn() as conn:
        for sheet, frame in crm_sheets.items():
            client_id = sheet.removeprefix("CRM ").strip().lower().replace("räber", "raeber")
            strategy = strategies.get(client_id, "Balanced")
            frame = frame.fillna("")
            name = str(frame.iloc[0].get("Client Contact", client_id.title())) if not frame.empty else client_id.title()
            conn.execute(
                """INSERT INTO clients (id, name, strategy) VALUES (?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET name=excluded.name, strategy=excluded.strategy""",
                (client_id, name, strategy)
            )
            conn.execute("DELETE FROM crm_notes WHERE client_id = ?", (client_id,))
            for _, row in frame.iterrows():
                text = str(row.get("Note", "")).strip()
                if not text:
                    continue
                date = row.get("Date", "")
                date_value = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)
                medium = str(row.get("Medium", "")).strip()
                conn.execute("INSERT INTO crm_notes (client_id, date, note) VALUES (?, ?, ?)", (client_id, date_value, f"[{medium}] {text}" if medium else text))

            conn.execute("DELETE FROM holdings WHERE client_id = ?", (client_id,))
            for _, row in portfolio_sheets[sample_sheet[strategy]].fillna("").iterrows():
                issuer = str(row.get("Issuer / Asset", "")).strip()
                if not issuer:
                    continue
                valor = str(row.get("Valor", "")).replace(".0", "")
                rating = ratings_by_valor.get(valor) or ratings_by_issuer.get(issuer) or "HOLD"
                conn.execute(
                    """INSERT INTO holdings
                       (client_id, issuer, sector, valor, mic, current_value_chf, target_value_chf, cio_rating)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (client_id, issuer, str(row.get("Industry Group", "")), valor, str(row.get("MIC", "")),
                     float(row.get("Current (CHF)") or 0), float(row.get("Target (CHF)") or 0), str(rating).upper())
                )

        conn.execute("DELETE FROM cio_recommendations")
        for _, row in cio.iterrows():
            issuer = str(row.get("Issuer / Asset", "")).strip()
            if issuer:
                mandates = mandates_by_issuer.get(issuer, set())
                mandate = "All" if len(mandates) == 3 or not mandates else ",".join(sorted(mandates))
                conn.execute(
                    "INSERT INTO cio_recommendations (issuer, sector, rating, mandate, comment) VALUES (?, ?, ?, ?, ?)",
                    (issuer, str(row.get("Industry Group", "")), str(row.get("Rating", "")).upper(), mandate, str(row.get("CIO View", "")))
                )
        conn.commit()
    print(f"Loaded {len(crm_sheets)} clients and {len(cio)} CIO recommendations from Excel")
