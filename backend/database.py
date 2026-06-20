"""
database.py - SQLite setup and all table definitions
"""
import sqlite3
import json
from pathlib import Path
import os

# Default: database.db in the same folder as this file.
# Override by setting the DB_PATH environment variable.
DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "database.db")))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def reset_transient_data():
    """Clear news, alerts, and generated messages so restarts don't duplicate."""
    with get_conn() as conn:
        conn.execute("DELETE FROM generated_messages")
        conn.execute("DELETE FROM alerts")
        conn.execute("DELETE FROM news_events")
        conn.commit()


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            strategy TEXT NOT NULL,
            dna_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS crm_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            date TEXT,
            note TEXT NOT NULL,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            issuer TEXT NOT NULL,
            isin TEXT,
            sector TEXT,
            asset_class TEXT,
            valor TEXT,
            mic TEXT,
            yahoo_ticker TEXT,
            current_value_chf REAL,
            target_value_chf REAL,
            quantity REAL,
            cio_rating TEXT,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        CREATE TABLE IF NOT EXISTS cio_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issuer TEXT NOT NULL,
            isin TEXT,
            sector TEXT,
            rating TEXT,
            mandate TEXT,
            swap_candidate TEXT,
            comment TEXT
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            date TEXT,
            isin TEXT,
            issuer TEXT,
            action TEXT,
            quantity REAL,
            price REAL,
            value_chf REAL,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        CREATE TABLE IF NOT EXISTS news_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            headline TEXT NOT NULL,
            company TEXT,
            theme TEXT,
            sentiment TEXT,
            severity TEXT,
            source TEXT,
            published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            alert_type TEXT,
            severity TEXT,
            holding TEXT,
            news_id INTEGER,
            reason TEXT,
            recommended_action TEXT,
            confidence INTEGER,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id),
            FOREIGN KEY (news_id) REFERENCES news_events(id)
        );

        CREATE TABLE IF NOT EXISTS generated_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            alert_id INTEGER,
            tone TEXT,
            content TEXT NOT NULL,
            approved INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id),
            FOREIGN KEY (alert_id) REFERENCES alerts(id)
        );
    """)

    # FTS5 virtual table for fast full-text search on CRM notes
    cur.executescript("""
        CREATE VIRTUAL TABLE IF NOT EXISTS crm_notes_fts
        USING fts5(note, client_id UNINDEXED, date UNINDEXED, content='crm_notes', content_rowid='id');

        CREATE TRIGGER IF NOT EXISTS crm_notes_ai AFTER INSERT ON crm_notes BEGIN
            INSERT INTO crm_notes_fts(rowid, note, client_id, date)
            VALUES (new.id, new.note, new.client_id, new.date);
        END;

        CREATE TRIGGER IF NOT EXISTS crm_notes_ad AFTER DELETE ON crm_notes BEGIN
            INSERT INTO crm_notes_fts(crm_notes_fts, rowid, note, client_id, date)
            VALUES ('delete', old.id, old.note, old.client_id, old.date);
        END;
    """)

    conn.commit()
    conn.close()


# ─── Schema description (used by SQL agent) ──────────────────────────────────

SCHEMA_DESCRIPTION = """
SQLite database schema:

clients(id TEXT PK, name TEXT, strategy TEXT [Defensive|Balanced|Growth], dna_json TEXT, created_at)
crm_notes(id INT PK, client_id TEXT FK, date TEXT, note TEXT)
crm_notes_fts  -- FTS5 virtual table; query with: SELECT rowid,note FROM crm_notes_fts WHERE note MATCH 'keyword'
holdings(id INT PK, client_id TEXT FK, issuer TEXT, isin TEXT, sector TEXT, asset_class TEXT,
         valor TEXT, mic TEXT, yahoo_ticker TEXT, current_value_chf REAL, target_value_chf REAL,
         quantity REAL, cio_rating TEXT [BUY|HOLD|SELL])
cio_recommendations(id INT PK, issuer TEXT, isin TEXT, sector TEXT, rating TEXT [BUY|HOLD|SELL],
                    mandate TEXT [Defensive|Balanced|Growth|All], swap_candidate TEXT, comment TEXT)
transactions(id INT PK, client_id TEXT FK, date TEXT, isin TEXT, issuer TEXT,
             action TEXT [BUY|SELL], quantity REAL, price REAL, value_chf REAL)
news_events(id INT PK, headline TEXT, company TEXT, theme TEXT, sentiment TEXT [positive|negative|neutral],
            severity TEXT [high|medium|low], source TEXT, published_at)
alerts(id INT PK, client_id TEXT FK, alert_type TEXT, severity TEXT [High|Medium|Low],
       holding TEXT, news_id INT FK, reason TEXT, recommended_action TEXT,
       confidence INT 0-100, status TEXT [open|dismissed|escalated|actioned], created_at)
generated_messages(id INT PK, client_id TEXT FK, alert_id INT FK, tone TEXT, content TEXT,
                   approved INT [0|1], created_at)

Rules:
- NEVER use DROP, DELETE, UPDATE, INSERT, CREATE in generated SQL — SELECT only
- Use crm_notes_fts for keyword search: WHERE note MATCH 'term1 OR term2'
- Join holdings to clients on client_id
- strategy values are exactly: Defensive, Balanced, Growth
"""


# ─── helpers ────────────────────────────────────────────────────────────────

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    return [dict(r) for r in rows]


def execute_read_sql(sql: str, params: tuple = ()) -> list[dict]:
    """Execute a read-only SQL query. Raises if non-SELECT detected."""
    normalized = sql.strip().upper()
    for forbidden in ("DROP ", "DELETE ", "UPDATE ", "INSERT ", "CREATE ", "ALTER "):
        if forbidden in normalized:
            raise ValueError(f"Write operation not allowed in SQL agent: {forbidden.strip()}")
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return rows_to_list(rows)


# ─── client queries ──────────────────────────────────────────────────────────

def get_all_clients():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM clients").fetchall()
    return rows_to_list(rows)


def get_client(client_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    return row_to_dict(row)


def upsert_client_dna(client_id: str, dna_json: str):
    with get_conn() as conn:
        conn.execute("UPDATE clients SET dna_json = ? WHERE id = ?", (dna_json, client_id))
        conn.commit()


# ─── CRM notes ───────────────────────────────────────────────────────────────

def get_crm_notes(client_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM crm_notes WHERE client_id = ? ORDER BY date DESC",
            (client_id,)
        ).fetchall()
    return rows_to_list(rows)


def search_crm_notes(client_id: str, keywords: list[str], limit: int = 10) -> list[dict]:
    """FTS5 keyword search on CRM notes for a client. Much faster than LIKE."""
    fts_query = " OR ".join(keywords)
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT n.id, n.client_id, n.date, n.note
               FROM crm_notes n
               JOIN crm_notes_fts f ON n.id = f.rowid
               WHERE f.note MATCH ? AND n.client_id = ?
               ORDER BY n.date DESC LIMIT ?""",
            (fts_query, client_id, limit)
        ).fetchall()
    return rows_to_list(rows)


# ─── holdings ────────────────────────────────────────────────────────────────

def get_holdings(client_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM holdings WHERE client_id = ?", (client_id,)
        ).fetchall()
    return rows_to_list(rows)


# ─── CIO recommendations ─────────────────────────────────────────────────────

def get_cio_recs(sector: str = None, mandate: str = None):
    with get_conn() as conn:
        query = "SELECT * FROM cio_recommendations WHERE 1=1"
        params = []
        if sector:
            query += " AND sector = ?"
            params.append(sector)
        if mandate:
            query += " AND (mandate = ? OR mandate = 'All')"
            params.append(mandate)
        rows = conn.execute(query, params).fetchall()
    return rows_to_list(rows)


# ─── transactions ─────────────────────────────────────────────────────────────

def get_transactions(client_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE client_id = ? ORDER BY date DESC",
            (client_id,)
        ).fetchall()
    return rows_to_list(rows)


# ─── news events ─────────────────────────────────────────────────────────────

def get_all_news():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM news_events ORDER BY published_at DESC"
        ).fetchall()
    return rows_to_list(rows)


def insert_news(headline, company, theme, sentiment, severity, source="mock"):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO news_events (headline, company, theme, sentiment, severity, source) VALUES (?,?,?,?,?,?)",
            (headline, company, theme, sentiment, severity, source)
        )
        conn.commit()
        return cur.lastrowid


# ─── alerts ──────────────────────────────────────────────────────────────────

def get_alerts(client_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT a.*, n.headline as news_headline FROM alerts a "
            "LEFT JOIN news_events n ON a.news_id = n.id "
            "WHERE a.client_id = ? ORDER BY a.created_at DESC",
            (client_id,)
        ).fetchall()
    return rows_to_list(rows)


def get_all_alerts():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT a.*, n.headline as news_headline FROM alerts a "
            "LEFT JOIN news_events n ON a.news_id = n.id "
            "ORDER BY a.created_at DESC"
        ).fetchall()
    return rows_to_list(rows)


def insert_alert(client_id, alert_type, severity, holding, news_id, reason, recommended_action, confidence):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO alerts
               (client_id, alert_type, severity, holding, news_id, reason, recommended_action, confidence)
               VALUES (?,?,?,?,?,?,?,?)""",
            (client_id, alert_type, severity, holding, news_id, reason, recommended_action, confidence)
        )
        conn.commit()
        return cur.lastrowid


def update_alert_status(alert_id: int, status: str):
    with get_conn() as conn:
        conn.execute("UPDATE alerts SET status = ? WHERE id = ?", (status, alert_id))
        conn.commit()


# ─── messages ────────────────────────────────────────────────────────────────

def insert_message(client_id, alert_id, tone, content):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO generated_messages (client_id, alert_id, tone, content) VALUES (?,?,?,?)",
            (client_id, alert_id, tone, content)
        )
        conn.commit()
        return cur.lastrowid


def get_messages(client_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM generated_messages WHERE client_id = ? ORDER BY created_at DESC",
            (client_id,)
        ).fetchall()
    return rows_to_list(rows)


def approve_message(message_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE generated_messages SET approved = 1 WHERE id = ?", (message_id,))
        conn.commit()
