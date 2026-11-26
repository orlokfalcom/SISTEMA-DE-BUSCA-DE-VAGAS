from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CONSENT_PURPOSES: dict[str, dict[str, str]] = {
    "A_connect_account": {
        "title": "Conexão da conta LinkedIn",
        "description": "Autenticar sua identidade via OAuth 2.0 oficial do LinkedIn.",
        "legal_basis": "Execução de procedimento preliminar / Consentimento do titular (LGPD Art. 7º, I e V)",
    },
    "B_import_profile": {
        "title": "Importação de dados profissionais disponíveis",
        "description": "Importar apenas nome, e-mail, foto/link e campos autorizados pelas permissões concedidas.",
        "legal_basis": "Consentimento específico do titular (LGPD Art. 7º, I)",
    },
    "C_job_matching": {
        "title": "Análise de compatibilidade com vagas",
        "description": "Cruzar competências e experiências com vagas para calcular aderência profissional.",
        "legal_basis": "Execução de serviço solicitado pelo titular (LGPD Art. 7º, V)",
    },
    "D_cv_generation": {
        "title": "Geração e atualização de currículo",
        "description": "Estruturar e exportar versões otimizadas para ATS em PDF e DOCX.",
        "legal_basis": "Execução de serviço solicitado pelo titular (LGPD Art. 7º, V)",
    },
    "E_profile_storage": {
        "title": "Armazenamento no VagaPulse AI",
        "description": "Manter histórico versionado e dados normalizados sob seu controle para edição e exclusão.",
        "legal_basis": "Consentimento do titular (LGPD Art. 7º, I)",
    },
    "F_anonymous_stats": {
        "title": "Melhoria estatística anonimizada (Opcional)",
        "description": "Uso agregado e irreversivelmente anonimizado para calibração de qualidade.",
        "legal_basis": "Consentimento opcional / Dados anonimizados (LGPD Art. 12)",
    },
}


class LinkedinTokenManager:
    """
    Gerenciador de criptografia de tokens em repouso (Encrypt-then-MAC) com separação
    de chaves, rotação via key_id e zero exposição em logs ou respostas.
    """

    def __init__(self, key_ring_path: str | Path | None = None) -> None:
        self._lock = threading.Lock()
        self.key_ring_path = Path(key_ring_path) if key_ring_path else Path("security_logs") / ".linkedin_keyring.json"
        self.key_ring_path.parent.mkdir(parents=True, exist_ok=True)
        self._keys: dict[str, bytes] = {}
        self._active_key_id: str = "v1"
        self._load_or_init_keys()

    def _load_or_init_keys(self) -> None:
        env_master = os.environ.get("LINKEDIN_TOKEN_ENC_KEY", "").strip()
        if env_master:
            self._keys["env-v1"] = hashlib.sha256(env_master.encode("utf-8")).digest()
            self._active_key_id = "env-v1"
            return

        if self.key_ring_path.exists():
            try:
                data = json.loads(self.key_ring_path.read_text(encoding="utf-8"))
                self._active_key_id = data.get("active", "v1")
                for kid, b64 in (data.get("keys") or {}).items():
                    self._keys[kid] = base64.urlsafe_b64decode(b64.encode("ascii"))
                if self._keys:
                    return
            except Exception:
                pass

        self._active_key_id = "v1"
        self._keys = {"v1": secrets.token_bytes(32)}
        self._persist_keys()

    def _persist_keys(self) -> None:
        payload = {
            "active": self._active_key_id,
            "keys": {k: base64.urlsafe_b64encode(v).decode("ascii") for k, v in self._keys.items()},
        }
        self.key_ring_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def rotate_key(self) -> str:
        with self._lock:
            new_id = f"v{len(self._keys) + 1}-{secrets.token_hex(2)}"
            self._keys[new_id] = secrets.token_bytes(32)
            self._active_key_id = new_id
            if not os.environ.get("LINKEDIN_TOKEN_ENC_KEY", "").strip():
                self._persist_keys()
            return new_id

    def _derive_subkeys(self, master_key: bytes) -> tuple[bytes, bytes]:
        enc_key = hmac.new(master_key, b"vp-enc-key", hashlib.sha256).digest()
        mac_key = hmac.new(master_key, b"vp-mac-key", hashlib.sha256).digest()
        return enc_key, mac_key

    def _keystream(self, enc_key: bytes, nonce: bytes, length: int) -> bytes:
        out = bytearray()
        counter = 0
        while len(out) < length:
            block = hashlib.sha256(enc_key + nonce + counter.to_bytes(4, "big")).digest()
            out.extend(block)
            counter += 1
        return bytes(out[:length])

    def encrypt(self, plaintext: str) -> dict[str, str]:
        if not plaintext:
            return {"key_id": self._active_key_id, "nonce": "", "ciphertext": "", "mac": ""}
        with self._lock:
            kid = self._active_key_id
            master = self._keys[kid]
        enc_key, mac_key = self._derive_subkeys(master)
        nonce = secrets.token_bytes(16)
        raw = plaintext.encode("utf-8")
        ks = self._keystream(enc_key, nonce, len(raw))
        ct = bytes(a ^ b for a, b in zip(raw, ks))
        tag = hmac.new(mac_key, kid.encode("utf-8") + nonce + ct, hashlib.sha256).digest()
        return {
            "key_id": kid,
            "nonce": base64.urlsafe_b64encode(nonce).decode("ascii"),
            "ciphertext": base64.urlsafe_b64encode(ct).decode("ascii"),
            "mac": base64.urlsafe_b64encode(tag).decode("ascii"),
        }

    def decrypt(self, blob: dict[str, str]) -> str:
        if not blob or not blob.get("ciphertext"):
            return ""
        kid = blob["key_id"]
        master = self._keys.get(kid)
        if not master:
            raise ValueError("Chave criptográfica indisponível para o token.")
        enc_key, mac_key = self._derive_subkeys(master)
        nonce = base64.urlsafe_b64decode(blob["nonce"].encode("ascii"))
        ct = base64.urlsafe_b64decode(blob["ciphertext"].encode("ascii"))
        tag = base64.urlsafe_b64decode(blob["mac"].encode("ascii"))
        expected = hmac.new(mac_key, kid.encode("utf-8") + nonce + ct, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected):
            raise ValueError("Integridade do token criptografado violada.")
        ks = self._keystream(enc_key, nonce, len(ct))
        raw = bytes(a ^ b for a, b in zip(ct, ks))
        return raw.decode("utf-8")


class LinkedinPrivacyStore:
    """
    Armazenamento SQLite com isolamento estrito por usuário (user_id),
    auditoria LGPD, consentimentos granulares, estados OAuth single-use e versões de CV.
    """

    def __init__(self, db_path: str | Path = "security_logs/linkedin_cv.db", token_manager: LinkedinTokenManager | None = None) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.token_manager = token_manager or LinkedinTokenManager(self.db_path.parent / ".linkedin_keyring.json")
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
                CREATE TABLE IF NOT EXISTS oauth_states (
                    state TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    code_verifier TEXT NOT NULL,
                    redirect_uri TEXT NOT NULL,
                    consents_json TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS used_auth_codes (
                    code_hash TEXT PRIMARY KEY,
                    used_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS linkedin_tokens (
                    user_id TEXT PRIMARY KEY,
                    token_blob_json TEXT NOT NULL,
                    refresh_blob_json TEXT NOT NULL,
                    scopes_json TEXT NOT NULL,
                    unavailable_scopes_json TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    status TEXT NOT NULL,
                    last_sync_at TEXT,
                    last_attempt_at TEXT,
                    last_error TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_consents (
                    user_id TEXT NOT NULL,
                    purpose_key TEXT NOT NULL,
                    granted INTEGER NOT NULL,
                    legal_basis TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, purpose_key)
                );
                CREATE TABLE IF NOT EXISTS professional_profiles (
                    user_id TEXT PRIMARY KEY,
                    profile_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cv_versions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    version_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    job_id TEXT,
                    content_text TEXT NOT NULL,
                    structured_json TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS privacy_audit_log (
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
        # Nunca registra tokens ou códigos em logs
        safe_details = str(details or "")[:300]
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO privacy_audit_log (user_id, action, details, created_at) VALUES (?, ?, ?, ?)",
                (user_id, action, safe_details, self._now()),
            )

    def get_audit_log(self, user_id: str, limit: int = 30) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT action, details, created_at FROM privacy_audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    def save_consents(self, user_id: str, consents: dict[str, bool]) -> None:
        now = self._now()
        with self._lock, self._connect() as conn:
            for key, meta in CONSENT_PURPOSES.items():
                granted = 1 if consents.get(key, False) else 0
                conn.execute(
                    """
                    INSERT INTO user_consents (user_id, purpose_key, granted, legal_basis, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, purpose_key) DO UPDATE SET granted=excluded.granted, updated_at=excluded.updated_at
                    """,
                    (user_id, key, granted, meta["legal_basis"], now),
                )
        self.log_audit(user_id, "consent_updated", f"Consentimentos atualizados: {sum(1 for v in consents.values() if v)}/{len(CONSENT_PURPOSES)}")

    def get_consents(self, user_id: str) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT purpose_key, granted, legal_basis, updated_at FROM user_consents WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        saved = {r["purpose_key"]: dict(r) for r in rows}
        out = {}
        for key, meta in CONSENT_PURPOSES.items():
            rec = saved.get(key)
            out[key] = {
                "title": meta["title"],
                "description": meta["description"],
                "legal_basis": meta["legal_basis"],
                "granted": bool(rec["granted"]) if rec else False,
                "updated_at": rec["updated_at"] if rec else None,
            }
        return out

    def save_oauth_state(self, state: str, user_id: str, code_verifier: str, redirect_uri: str, consents: dict[str, bool], ttl_seconds: int = 600) -> None:
        import time
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO oauth_states (state, user_id, code_verifier, redirect_uri, consents_json, expires_at, used) VALUES (?, ?, ?, ?, ?, ?, 0)",
                (state, user_id, code_verifier, redirect_uri, json.dumps(consents), time.time() + ttl_seconds),
            )

    def consume_oauth_state(self, state: str, user_id: str) -> dict[str, Any] | None:
        import time
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM oauth_states WHERE state = ?",
                (state,),
            ).fetchone()
            if not row:
                return None
            if row["used"] or row["user_id"] != user_id or row["expires_at"] < time.time():
                return None
            conn.execute("UPDATE oauth_states SET used = 1 WHERE state = ?", (state,))
            return dict(row)

    def mark_auth_code_used(self, code: str) -> bool:
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        with self._lock, self._connect() as conn:
            existing = conn.execute("SELECT 1 FROM used_auth_codes WHERE code_hash = ?", (code_hash,)).fetchone()
            if existing:
                return False
            conn.execute("INSERT INTO used_auth_codes (code_hash, used_at) VALUES (?, ?)", (code_hash, self._now()))
            return True

    def save_tokens(
        self,
        user_id: str,
        access_token: str,
        refresh_token: str,
        scopes: list[str],
        unavailable_scopes: list[str],
        expires_at: float,
        status: str = "connected",
    ) -> None:
        token_blob = json.dumps(self.token_manager.encrypt(access_token))
        refresh_blob = json.dumps(self.token_manager.encrypt(refresh_token)) if refresh_token else "{}"
        now = self._now()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO linkedin_tokens (user_id, token_blob_json, refresh_blob_json, scopes_json, unavailable_scopes_json, expires_at, status, last_sync_at, last_attempt_at, last_error, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
                ON CONFLICT(user_id) DO UPDATE SET
                  token_blob_json=excluded.token_blob_json,
                  refresh_blob_json=excluded.refresh_blob_json,
                  scopes_json=excluded.scopes_json,
                  unavailable_scopes_json=excluded.unavailable_scopes_json,
                  expires_at=excluded.expires_at,
                  status=excluded.status,
                  last_sync_at=excluded.last_sync_at,
                  last_attempt_at=excluded.last_attempt_at,
                  last_error='',
                  updated_at=excluded.updated_at
                """,
                (user_id, token_blob, refresh_blob, json.dumps(scopes), json.dumps(unavailable_scopes), expires_at, status, now, now, now),
            )
        self.log_audit(user_id, "linkedin_connected", f"Conexão OAuth registrada com escopos: {', '.join(scopes) or 'nenhum'}")

    def get_connection_status(self, user_id: str) -> dict[str, Any]:
        import time
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM linkedin_tokens WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            return {
                "status": "disconnected",
                "connected": False,
                "scopes_granted": [],
                "scopes_unavailable": ["r_fullprofile (produto Partner Program não habilitado por padrão)"],
                "token_state": "none",
                "last_sync_at": None,
                "last_attempt_at": None,
                "last_error": None,
            }
        expired = row["expires_at"] < time.time()
        status = "expired" if (row["status"] == "connected" and expired) else row["status"]
        return {
            "status": status,
            "connected": status == "connected",
            "scopes_granted": json.loads(row["scopes_json"] or "[]"),
            "scopes_unavailable": json.loads(row["unavailable_scopes_json"] or "[]"),
            "token_state": "expired" if expired else "valid_encrypted",
            "last_sync_at": row["last_sync_at"],
            "last_attempt_at": row["last_attempt_at"],
            "last_error": row["last_error"] or None,
        }

    def get_decrypted_access_token(self, user_id: str) -> str | None:
        import time
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT token_blob_json, expires_at, status FROM linkedin_tokens WHERE user_id = ?", (user_id,)).fetchone()
        if not row or row["status"] != "connected" or row["expires_at"] < time.time():
            return None
        blob = json.loads(row["token_blob_json"])
        return self.token_manager.decrypt(blob)

    def disconnect(self, user_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM linkedin_tokens WHERE user_id = ?", (user_id,))
        self.log_audit(user_id, "linkedin_disconnected", "Tokens removidos e conexão LinkedIn encerrada.")

    def save_profile(self, user_id: str, profile: dict[str, Any]) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO professional_profiles (user_id, profile_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at
                """,
                (user_id, json.dumps(profile, ensure_ascii=False), self._now()),
            )
        self.log_audit(user_id, "profile_saved", "Perfil profissional consolidado salvo.")

    def get_profile(self, user_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT profile_json FROM professional_profiles WHERE user_id = ?", (user_id,)).fetchone()
        return json.loads(row["profile_json"]) if row else None

    def save_cv_version(self, user_id: str, version_type: str, title: str, content_text: str, structured: dict[str, Any], created_by: str, job_id: str | None = None) -> dict[str, Any]:
        vid = f"cv-{secrets.token_hex(6)}"
        now = self._now()
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO cv_versions (id, user_id, version_type, title, job_id, content_text, structured_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (vid, user_id, version_type, title, job_id, content_text, json.dumps(structured, ensure_ascii=False), created_by, now),
            )
        self.log_audit(user_id, "cv_version_created", f"Versão {vid} ({version_type}) criada por {created_by}.")
        return {"id": vid, "version_type": version_type, "title": title, "job_id": job_id, "content_text": content_text, "created_by": created_by, "created_at": now}

    def list_cv_versions(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, version_type, title, job_id, content_text, created_by, created_at FROM cv_versions WHERE user_id = ? ORDER BY created_at DESC LIMIT 40",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_cv_version(self, user_id: str, version_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM cv_versions WHERE id = ? AND user_id = ?",
                (version_id, user_id),
            ).fetchone()
        return dict(row) if row else None

    def erase_all_user_data(self, user_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM linkedin_tokens WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM professional_profiles WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM cv_versions WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM user_consents WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM oauth_states WHERE user_id = ?", (user_id,))
        self.log_audit(user_id, "lgpd_data_erased", "Todos os dados importados, tokens, consentimentos e versões foram excluídos.")
