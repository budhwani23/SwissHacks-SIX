"""
seed.py - One-shot script to initialise DB and load all data.

Run once before starting the server:
    python seed.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from database import init_db
from services.workbook_loader import load_from_excel
from services.news_service import load_mock_news
from agents.reasoning_agent import run_analysis_for_all_clients

if __name__ == "__main__":
    print("=== SwissHacks CRM Backend Seed ===")

    print("\n[1/4] Initialising database...")
    init_db()

    print("\n[2/4] Loading client & portfolio data...")
    load_from_excel()

    print("\n[3/4] Loading mock news triggers...")
    load_mock_news()

    print("\n[4/4] Running initial alert analysis...")
    results = run_analysis_for_all_clients(min_score=25)
    total = sum(len(v) for v in results.values())
    print(f"      {total} alerts generated across {len(results)} clients")

    print("\n✓ Seed complete. Start the server with:")
    print("  uvicorn main:app --reload --port 8000")
