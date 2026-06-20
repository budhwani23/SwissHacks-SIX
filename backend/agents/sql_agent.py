"""
sql_agent.py - Natural language → SQL → execute → return results

Pipeline:
  1. User question (natural language)
  2. LLM generates a SELECT-only SQL query using SCHEMA_DESCRIPTION as context
  3. execute_read_sql() runs it safely (rejects any write ops)
  4. Optionally: LLM summarises raw rows into a human-readable answer

Usage:
    from agents.sql_agent import query, query_with_summary

    rows = query("Which clients have holdings in the Healthcare sector?")
    answer = query_with_summary("How many open alerts does Schneider have?")
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import database as db
from database import SCHEMA_DESCRIPTION, execute_read_sql
from services.llm_service import call_llm, call_llm_json

# ─── Prompts ──────────────────────────────────────────────────────────────────

SQL_SYSTEM = f"""You are a read-only SQL agent for a Swiss private banking CRM system.
Generate a single, valid SQLite SELECT query to answer the user's question.

{SCHEMA_DESCRIPTION}

RULES:
- Output ONLY the SQL query — no explanation, no markdown, no code fences
- Only SELECT statements are allowed — never DROP, DELETE, UPDATE, INSERT, CREATE, ALTER
- For text search on CRM notes use FTS5: SELECT n.id, n.date, n.note FROM crm_notes n JOIN crm_notes_fts f ON n.id = f.rowid WHERE f.note MATCH 'term1 OR term2' AND n.client_id = ?
- Use proper SQLite syntax (LIKE is case-insensitive, use LOWER() for case-insensitive non-FTS comparisons)
- When filtering by client name, join clients and filter on clients.name LIKE '%<name>%'
- If the question is ambiguous, write a reasonable query that captures the most likely intent
"""

SUMMARY_SYSTEM = """You are a concise Swiss private banking AI assistant.
Given a user question and raw database query results, write a clear, direct answer in 1-3 sentences.
Focus on the business insight — do not repeat column names verbatim.
If results are empty, say so plainly."""


# ─── Core functions ───────────────────────────────────────────────────────────

def generate_sql(question: str) -> str:
    """Ask LLM to generate a SELECT SQL query for the given natural language question."""
    raw = call_llm(
        prompt=question,
        system=SQL_SYSTEM,
        json_mode=False
    )
    # Strip accidental markdown code fences
    sql = raw.strip()
    for fence in ("```sql", "```sqlite", "```"):
        if sql.startswith(fence):
            sql = sql[len(fence):]
    if sql.endswith("```"):
        sql = sql[:-3]
    return sql.strip()


def query(question: str) -> dict:
    """
    Run a natural language query against the DB.
    Returns: { sql, rows, row_count, error? }
    """
    try:
        sql = generate_sql(question)
        rows = execute_read_sql(sql)
        return {
            "question": question,
            "sql": sql,
            "rows": rows,
            "row_count": len(rows),
        }
    except ValueError as e:
        # Forbidden write op detected
        return {
            "question": question,
            "sql": None,
            "rows": [],
            "row_count": 0,
            "error": str(e),
        }
    except Exception as e:
        return {
            "question": question,
            "sql": None,
            "rows": [],
            "row_count": 0,
            "error": f"SQL execution error: {e}",
        }


def query_with_summary(question: str) -> dict:
    """
    Run a natural language query and ask the LLM to summarise the results.
    Returns: { sql, rows, row_count, summary, error? }
    """
    result = query(question)

    if result.get("error") or not result["rows"]:
        summary = (
            result.get("error")
            or "No results found for that query."
        )
        return {**result, "summary": summary}

    # Summarise rows in plain language
    rows_preview = result["rows"][:50]  # cap to avoid huge prompts
    prompt = f"""Question: {question}

Query results ({result['row_count']} rows):
{rows_preview}

Write a clear, concise answer to the question based on these results."""

    try:
        summary = call_llm(prompt, system=SUMMARY_SYSTEM)
    except Exception as e:
        summary = f"(Summary unavailable: {e})"

    return {**result, "summary": summary}


def search_notes_for_topics(client_id: str, topics: list[str], limit: int = 5) -> list[dict]:
    """
    FTS5-powered CRM note search. Used by crm_agent to retrieve
    only the relevant notes before LLM DNA extraction.
    Wraps database.search_crm_notes for convenience.
    """
    return db.search_crm_notes(client_id, topics, limit=limit)
