from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any


HIGH_IMPACT_ACTIONS = {"suspend_account", "isolate_endpoint", "disable_credential"}


class SoarPlaybookEngine:
    """
    Motor SOAR com execução auditável, modo de simulação (dry_run),
    gate de aprovação humana para ações de alto impacto e rollback reversível.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.blocked_ips: dict[str, dict[str, Any]] = {}
        self.revoked_sessions: set[str] = set()
        self.pending_approvals: dict[str, dict[str, Any]] = {}
        self.execution_history: list[dict[str, Any]] = []

    def execute_action(
        self,
        *,
        action: str,
        target: str,
        reason: str,
        dry_run: bool = False,
        admin_approved: bool = False,
    ) -> dict[str, Any]:
        action_id = f"soar-{uuid.uuid4().hex[:10]}"
        ts = datetime.now(timezone.utc).isoformat()

        with self._lock:
            # Nunca derruba localhost/loopback
            if action == "block_ip" and target in {"127.0.0.1", "::1", "localhost", ""}:
                record = {
                    "action_id": action_id,
                    "timestamp": ts,
                    "action": action,
                    "target": target,
                    "status": "skipped_protected_localhost",
                    "reversible": True,
                    "reason": reason,
                }
                self.execution_history.append(record)
                return record

            if action in HIGH_IMPACT_ACTIONS and not admin_approved:
                record = {
                    "action_id": action_id,
                    "timestamp": ts,
                    "action": action,
                    "target": target,
                    "status": "pending_admin_approval",
                    "reversible": True,
                    "reason": reason,
                }
                self.pending_approvals[action_id] = record
                self.execution_history.append(record)
                return record

            if dry_run:
                record = {
                    "action_id": action_id,
                    "timestamp": ts,
                    "action": action,
                    "target": target,
                    "status": "simulated_dry_run",
                    "reversible": True,
                    "reason": reason,
                }
                self.execution_history.append(record)
                return record

            if action == "block_ip":
                self.blocked_ips[target] = {"action_id": action_id, "reason": reason, "ts": ts}
            elif action == "revoke_session":
                self.revoked_sessions.add(target)

            record = {
                "action_id": action_id,
                "timestamp": ts,
                "action": action,
                "target": target,
                "status": "executed",
                "reversible": True,
                "reason": reason,
            }
            self.execution_history.append(record)
            if len(self.execution_history) > 300:
                self.execution_history = self.execution_history[-300:]
            return record

    def rollback(self, action_id: str) -> dict[str, Any]:
        with self._lock:
            for rec in self.execution_history:
                if rec["action_id"] == action_id and rec["status"] == "executed":
                    if rec["action"] == "block_ip":
                        self.blocked_ips.pop(rec["target"], None)
                    elif rec["action"] == "revoke_session":
                        self.revoked_sessions.discard(rec["target"])
                    rec["status"] = "rolled_back"
                    rec["rolled_back_at"] = datetime.now(timezone.utc).isoformat()
                    return {"ok": True, "action": rec}
            return {"ok": False, "error": "Action not found or not reversible/executed."}
