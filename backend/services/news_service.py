"""
news_service.py - Fetch news via Event Registry REST API (eventregistry.org)

API base: https://eventregistry.org/api/v1
Key endpoint: GET /article/getArticles
Auth: apiKey query param (from NEWSAPI_KEY env var)
"""
import json
import os
import httpx
from datetime import datetime, timedelta
from pathlib import Path
import database as db

MOCK_NEWS_FILE = Path(__file__).parent.parent / "data" / "mock_news.json"

# Event Registry base URL
ER_BASE = os.getenv("NEWSAI_API_URL", "https://eventregistry.org/api/v1")


def load_mock_news() -> list[dict]:
    """Read mock_news.json and insert any new events into the DB."""
    if not MOCK_NEWS_FILE.exists():
        print("mock_news.json not found")
        return []

    with open(MOCK_NEWS_FILE) as f:
        events = json.load(f)

    inserted = []
    for e in events:
        news_id = db.insert_news(
            headline=e["headline"],
            company=e["company"],
            theme=e["theme"],
            sentiment=e["sentiment"],
            severity=e["severity"],
            source="mock"
        )
        inserted.append({**e, "id": news_id})

    print(f"✓ Loaded {len(inserted)} mock news events")
    return inserted


def fetch_live_news(
    keywords: list[str],
    days_back: int = 7,
    max_articles: int = 20,
    lang: str = "eng"
) -> list[dict]:
    """
    Fetch articles from Event Registry matching any of the given keywords.

    Endpoint: GET /article/getArticles
    Docs: https://eventregistry.org/documentation/api

    Parameters used:
      - apiKey       : from NEWSAPI_KEY env var
      - keyword      : search term (one per call; OR logic achieved by calling per keyword)
      - lang         : language filter (default: eng)
      - articlesCount: max articles to return (up to 100)
      - articlesSortBy: sort by date (most recent first)
      - resultType   : articles
      - dateStart    : YYYY-MM-DD  (today minus days_back)
      - includeArticleTitle     : true
      - includeArticleBasicInfo : true  (gives date, url, source)
      - includeArticleBody      : true
      - includeArticleSentiment : true

    Returns list of dicts with keys: headline, company, theme, sentiment, severity, source
    """
    api_key = "9b851e1b-7cb6-4571-b7aa-f8f3a16a3a00"
    if not api_key:
        print("NEWSAPI_KEY not set – skipping live news")
        return []

    date_start = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    articles_collected = []

    for keyword in keywords:
        params = {
            "apiKey": api_key,
            "keyword": keyword,
            "lang": lang,
            "articlesCount": max_articles,
            "articlesSortBy": "date",
            "articlesSortByAsc": "false",
            "resultType": "articles",
            "dateStart": date_start,
            "includeArticleTitle": "true",
            "includeArticleBasicInfo": "true",
            "includeArticleBody": "false",   # body costs tokens, skip for now
            "includeArticleSentiment": "true",
            "isDuplicateFilter": "skipDuplicates",
        }

        try:
            resp = httpx.get(
                f"{ER_BASE}/article/getArticles",
                params=params,
                timeout=15.0
            )
            resp.raise_for_status()
            data = resp.json()
            print(data)
        except Exception as e:
            print(f"Event Registry fetch failed for '{keyword}': {e}")
            continue

        # Response shape: {"articles": {"results": [...], "totalResults": N, ...}}
        results = data.get("articles", {}).get("results", [])

        for art in results:
            title = art.get("title", "")
            if not title:
                continue

            # Map sentiment: Event Registry returns -1 to 1 float
            raw_sentiment = art.get("sentiment")
            if raw_sentiment is None:
                sentiment = "neutral"
            elif raw_sentiment > 0.1:
                sentiment = "positive"
            elif raw_sentiment < -0.1:
                sentiment = "negative"
            else:
                sentiment = "neutral"

            articles_collected.append({
                "headline": title,
                "company": keyword,
                "theme": "live",
                "sentiment": sentiment,
                "severity": "medium",   # live news severity is determined by reasoning engine
                "source": art.get("source", {}).get("uri", "eventregistry"),
                "url": art.get("url", ""),
                "date": art.get("dateTime", ""),
            })

    print(f"✓ Fetched {len(articles_collected)} live articles for {len(keywords)} keywords")
    return articles_collected


def fetch_and_store_live_news(keywords: list[str], days_back: int = 7) -> list[dict]:
    """Fetch live news and insert into DB. Returns inserted records."""
    articles = fetch_live_news(keywords, days_back=days_back)
    inserted = []
    for a in articles:
        news_id = db.insert_news(
            headline=a["headline"],
            company=a["company"],
            theme=a.get("theme", "live"),
            sentiment=a.get("sentiment", "neutral"),
            severity=a.get("severity", "medium"),
            source=a.get("source", "eventregistry")
        )
        inserted.append({**a, "id": news_id})
    return inserted
