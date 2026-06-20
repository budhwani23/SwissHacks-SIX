"""
news_agent.py - Load and expose news events.
Mock triggers are the demo-safe path; live news is an enhancement.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import database as db
from services.news_service import load_mock_news, fetch_and_store_live_news


def get_all_news() -> list[dict]:
    return db.get_all_news()


def refresh_mock_news() -> list[dict]:
    """Reload news from mock_news.json into DB."""
    return load_mock_news()


def refresh_live_news(companies: list[str], days_back: int = 7) -> list[dict]:
    """
    Fetch live articles from Event Registry for a list of company names.
    Stores results in DB and returns inserted records.
    """
    return fetch_and_store_live_news(companies, days_back=days_back)
