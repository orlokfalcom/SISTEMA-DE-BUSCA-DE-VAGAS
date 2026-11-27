from __future__ import annotations

import contextlib
import json
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PIPELINE_STAGES = [
    "Oportunidade identificada",
    "Em análise",
    "Currículo preparado",
    "Candidatura enviada",
    "Triagem",
    "Entrevista",
    "Aprovação",
    "Reprovação",
    "Encerrada",
]


class EmployabilityStore:
    """
    Persistência SQLite isolada por usuário (user_id) para Perfil Mestre,
    Oportunidades, Versões Dinâmicas de Currículo, Acompanhamento e Auditoria.
    """

    def __init__(self, db_path: str | Path = "security_logs/employability.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    @contextlib.contextmanager
    def _connect(self):
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS master_profiles (
                    user_id TEXT PRIMARY KEY,
                    profile_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS opportunities (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    company TEXT NOT NULL,
                    title TEXT NOT NULL,
                    area TEXT NOT NULL,
                    location TEXT NOT NULL,
                    url TEXT,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    next_steps TEXT NOT NULL DEFAULT '',
                    applied_confirmed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS opportunity_cv_versions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    opportunity_id TEXT NOT NULL,
                    version_num INTEGER NOT NULL,
                    company TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content_text TEXT NOT NULL,
                    structured_json TEXT NOT NULL,
                    ats_score INTEGER NOT NULL,
                    ats_report_json TEXT NOT NULL,
                    skills_gap_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    changelog_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS employability_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def log_audit(self, user_id: str, action: str, details: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO employability_audit_log (user_id, action, details, created_at) VALUES (?, ?, ?, ?)",
                (user_id, action, str(details)[:300], self._now()),
            )

    # ---------- Perfil Profissional Mestre ----------
    def save_master_profile(self, user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO master_profiles (user_id, profile_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at
                """,
                (user_id, json.dumps(profile, ensure_ascii=False), now),
            )
        self.log_audit(user_id, "master_profile_saved", "Perfil Profissional Mestre atualizado.")
        return {**profile, "updated_at": now}

    def get_master_profile(self, user_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT profile_json, updated_at FROM master_profiles WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            return None
        data = json.loads(row["profile_json"])
        data["updated_at"] = row["updated_at"]
        return data

    # ---------- Oportunidades ----------
    def create_opportunity(
        self,
        user_id: str,
        *,
        company: str,
        title: str,
        area: str = "Tecnologia",
        location: str = "Remoto",
        url: str = "",
        description: str = "",
        notes: str = "",
        next_steps: str = "",
    ) -> dict[str, Any]:
        oid = f"opp-{secrets.token_hex(6)}"
        now = self._now()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO opportunities (id, user_id, company, title, area, location, url, description, status, notes, next_steps, applied_confirmed, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (oid, user_id, company, title, area, location, url, description, "Oportunidade identificada", notes, next_steps, now, now),
            )
        self.log_audit(user_id, "opportunity_created", f"Oportunidade {oid}: {title} @ {company}")
        return self.get_opportunity(user_id, oid)  # type: ignore[return-value]

    def get_opportunity(self, user_id: str, opp_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM opportunities WHERE id = ? AND user_id = ?", (opp_id, user_id)).fetchone()
        return dict(row) if row else None

    def list_opportunities(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM opportunities WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def update_opportunity_status(
        self,
        user_id: str,
        opp_id: str,
        *,
        status: str,
        notes: str | None = None,
        next_steps: str | None = None,
        confirm_applied: bool = False,
    ) -> dict[str, Any]:
        if status not in PIPELINE_STAGES:
            raise ValueError(f"Status inválido. Use um de: {', '.join(PIPELINE_STAGES)}")
        if status == "Candidatura enviada" and not confirm_applied:
            raise ValueError("Confirmação explícita do usuário (confirm_applied=true) é obrigatória para marcar 'Candidatura enviada'.")
        existing = self.get_opportunity(user_id, opp_id)
        if not existing:
            raise LookupError("Oportunidade não encontrada para este usuário.")

        now = self._now()
        new_notes = notes if notes is not None else existing["notes"]
        new_steps = next_steps if next_steps is not None else existing["next_steps"]
        applied_flag = 1 if (confirm_applied or existing["applied_confirmed"]) else 0
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE opportunities SET status = ?, notes = ?, next_steps = ?, applied_confirmed = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                (status, new_notes, new_steps, applied_flag, now, opp_id, user_id),
            )
            conn.execute(
                "UPDATE opportunity_cv_versions SET status = ? WHERE opportunity_id = ? AND user_id = ?",
                (status, opp_id, user_id),
            )
        self.log_audit(user_id, "opportunity_status_updated", f"{opp_id} -> {status}")
        return self.get_opportunity(user_id, opp_id)  # type: ignore[return-value]

    # ---------- Versões de Currículo por Oportunidade ----------
    def save_opportunity_cv_version(
        self,
        user_id: str,
        *,
        opportunity_id: str,
        company: str,
        role: str,
        content_text: str,
        structured: dict[str, Any],
        ats_score: int,
        ats_report: dict[str, Any],
        skills_gap: dict[str, Any],
        status: str,
        changelog: list[str],
    ) -> dict[str, Any]:
        vid = f"ocv-{secrets.token_hex(6)}"
        now = self._now()
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(version_num), 0) AS max_v FROM opportunity_cv_versions WHERE user_id = ? AND opportunity_id = ?",
                (user_id, opportunity_id),
            ).fetchone()
            next_v = int(row["max_v"]) + 1
            conn.execute(
                """
                INSERT INTO opportunity_cv_versions (
                    id, user_id, opportunity_id, version_num, company, role, content_text,
                    structured_json, ats_score, ats_report_json, skills_gap_json, status, changelog_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    vid, user_id, opportunity_id, next_v, company, role, content_text,
                    json.dumps(structured, ensure_ascii=False),
                    int(ats_score),
                    json.dumps(ats_report, ensure_ascii=False),
                    json.dumps(skills_gap, ensure_ascii=False),
                    status,
                    json.dumps(changelog, ensure_ascii=False),
                    now,
                ),
            )
        self.log_audit(user_id, "opportunity_cv_saved", f"{vid} (v{next_v}) para {role} @ {company}")
        return self.get_cv_version(user_id, vid)  # type: ignore[return-value]

    def get_cv_version(self, user_id: str, version_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM opportunity_cv_versions WHERE id = ? AND user_id = ?",
                (version_id, user_id),
            ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["structured"] = json.loads(d.pop("structured_json"))
        d["ats_report"] = json.loads(d.pop("ats_report_json"))
        d["skills_gap"] = json.loads(d.pop("skills_gap_json"))
        d["changelog"] = json.loads(d.pop("changelog_json"))
        return d

    def list_cv_versions(self, user_id: str, opportunity_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            if opportunity_id:
                rows = conn.execute(
                    "SELECT * FROM opportunity_cv_versions WHERE user_id = ? AND opportunity_id = ? ORDER BY version_num DESC",
                    (user_id, opportunity_id),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM opportunity_cv_versions WHERE user_id = ? ORDER BY created_at DESC LIMIT 60",
                    (user_id,),
                ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["structured"] = json.loads(d.pop("structured_json"))
            d["ats_report"] = json.loads(d.pop("ats_report_json"))
            d["skills_gap"] = json.loads(d.pop("skills_gap_json"))
            d["changelog"] = json.loads(d.pop("changelog_json"))
            out.append(d)
        return out

    def clear_history(self, user_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM opportunity_cv_versions WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM opportunities WHERE user_id = ?", (user_id,))
        self.log_audit(user_id, "history_cleared", "Histórico de oportunidades e versões de CV limpo pelo usuário.")
