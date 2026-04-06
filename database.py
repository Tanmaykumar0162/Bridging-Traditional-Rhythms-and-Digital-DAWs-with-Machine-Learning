import hashlib
import os
import secrets
import sqlite3
from datetime import datetime

DB_PATH = "tablatodrum.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT 'Untitled Dhun',
            bpm REAL,
            laya TEXT,
            detected_taal TEXT,
            total_strokes INTEGER,
            duration_sec REAL,
            avg_deviation_ms REAL,
            max_deviation_ms REAL,
            humanize_score REAL,
            meter TEXT,
            midi_path TEXT,
            groove_path TEXT,
            groove_profile_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_projects_user_created_at
        ON projects (user_id, created_at DESC)
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id
        ON sessions (user_id)
    """)

    conn.commit()
    conn.close()
    print("[+] Database initialized at", DB_PATH)


def _hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return hashed.hex(), salt


def register_user(username, password):
    conn = get_connection()
    try:
        password_hash, salt = _hash_password(password)
        conn.execute(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            (username.strip().lower(), password_hash, salt),
        )
        conn.commit()
        return True, "Registration successful"
    except sqlite3.IntegrityError:
        return False, "Username already exists"
    finally:
        conn.close()


def authenticate_user(username, password):
    conn = get_connection()
    row = conn.execute(
        "SELECT id, password_hash, salt FROM users WHERE username = ?",
        (username.strip().lower(),),
    ).fetchone()
    conn.close()

    if not row:
        return None

    computed_hash, _ = _hash_password(password, row["salt"])
    if computed_hash == row["password_hash"]:
        return row["id"]
    return None


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    conn = get_connection()
    conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()
    conn.close()
    return token


def get_user_from_session(token):
    if not token:
        return None
    conn = get_connection()
    row = conn.execute(
        "SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?",
        (token,),
    ).fetchone()
    conn.close()
    if row:
        return {"id": row["id"], "username": row["username"]}
    return None


def delete_session(token):
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def save_project(user_id, project_data):
    conn = get_connection()
    cursor = conn.execute(
        """INSERT INTO projects
           (user_id, name, bpm, laya, detected_taal, total_strokes, duration_sec,
            avg_deviation_ms, max_deviation_ms, humanize_score, meter,
            midi_path, groove_path, groove_profile_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            project_data.get("name", "Untitled Dhun"),
            project_data.get("bpm"),
            project_data.get("laya"),
            project_data.get("detected_taal"),
            project_data.get("total_strokes"),
            project_data.get("duration_sec"),
            project_data.get("avg_deviation_ms"),
            project_data.get("max_deviation_ms"),
            project_data.get("humanize_score"),
            project_data.get("meter"),
            project_data.get("midi_path"),
            project_data.get("groove_path"),
            project_data.get("groove_profile_json"),
        ),
    )
    project_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return project_id


def get_user_projects(user_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def rename_project(project_id, user_id, new_name):
    conn = get_connection()
    conn.execute(
        "UPDATE projects SET name = ? WHERE id = ? AND user_id = ?",
        (new_name.strip(), project_id, user_id),
    )
    conn.commit()
    conn.close()


def delete_project(project_id, user_id):
    conn = get_connection()
    conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
    conn.commit()
    conn.close()


# Initialize DB on import
init_db()
