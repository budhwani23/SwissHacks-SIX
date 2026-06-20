"""Safe natural-language search over the local CRM SQLite database."""

import re
import database as db
from services.llm_service import call_llm_json, call_llm


FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|attach|detach|pragma|replace|vacuum)\b", re.I)


def _schema():
    allowed = ("clients", "crm_notes", "holdings", "cio_recommendations", "news_events", "alerts", "generated_messages")
    with db.get_conn() as conn:
        parts = []
        for table in allowed:
            columns = conn.execute(f"PRAGMA table_info({table})").fetchall()
            parts.append(f"{table}({', '.join(c['name'] for c in columns)})")
    return "\n".join(parts)


def _rule_query(question: str):
    q = question.lower()
    if "sell-rated" in q or "sell rated" in q:
        return """SELECT c.id AS client_id, c.name AS client_name, h.issuer, h.sector, h.cio_rating
                  FROM clients c JOIN holdings h ON h.client_id = c.id
                  WHERE UPPER(h.cio_rating) = 'SELL' ORDER BY c.name, h.issuer"""
    if "high" in q and "alert" in q:
        return """SELECT c.name AS client_name, a.holding, a.alert_type, a.severity, a.status
                  FROM alerts a JOIN clients c ON c.id = a.client_id
                  WHERE LOWER(a.severity) = 'high' ORDER BY a.created_at DESC"""
    if "open" in q and "alert" in q:
        return """SELECT c.name AS client_name, COUNT(*) AS open_alerts
                  FROM alerts a JOIN clients c ON c.id = a.client_id
                  WHERE a.status = 'open' GROUP BY c.id, c.name ORDER BY open_alerts DESC"""
    return None


def _generate_sql(question: str):
    prompt = f"""Convert the user's question into one SQLite SELECT query.
Use only this schema:
{_schema()}

Rules: read-only SELECT or WITH only; no PRAGMA; no mutation; maximum 100 rows.
Question: {question}
Return JSON exactly as {{"sql": "..."}}."""
    result = call_llm_json(prompt)
    return result.get("sql", "")


def _validate(sql: str):
    cleaned = sql.strip().rstrip(";")
    if not re.match(r"^(select|with)\b", cleaned, re.I) or FORBIDDEN.search(cleaned):
        raise ValueError("Only safe, read-only SELECT queries are allowed")
    if ";" in cleaned:
        raise ValueError("Multiple SQL statements are not allowed")
    return cleaned


def query(question: str, summarise: bool = True):
    if not question or not question.strip():
        raise ValueError("question is required")
    sql = _validate(_rule_query(question) or _generate_sql(question))
    limited_sql = f"SELECT * FROM ({sql}) AS result LIMIT 100"
    with db.get_conn() as conn:
        rows = [dict(row) for row in conn.execute(limited_sql).fetchall()]

    summary = None
    if summarise:
        if not rows:
            summary = "No matching records were found."
        else:
            try:
                summary = call_llm(f"Answer the question in 2 concise sentences using only these rows.\nQuestion: {question}\nRows: {rows}")
            except Exception:
                summary = f"Found {len(rows)} matching record{'s' if len(rows) != 1 else ''}."
    return {"question": question, "sql": sql, "rows": rows, "summary": summary, "row_count": len(rows)}
