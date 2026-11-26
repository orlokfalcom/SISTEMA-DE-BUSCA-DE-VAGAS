from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path
from typing import Any


class ForensicCustodyLog:
    """
    Registro forense encadeado por SHA-256 (tamper-evident) e cofre de quarentena.
    Cada entrada inclui hash da entrada anterior (prev_hash) e próprio hash (entry_hash).
    """

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.chain_path = self.base_dir / "forensic_chain.jsonl"
        self.quarantine_dir = self.base_dir / "quarantine"
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._last_hash = self._read_last_hash()

    def _read_last_hash(self) -> str:
        if not self.chain_path.exists():
            return "0" * 64
        last = "0" * 64
        try:
            with self.chain_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        last = rec.get("entry_hash", last)
                    except json.JSONDecodeError:
                        continue
        except OSError:
            pass
        return last

    def append_record(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            record = {
                "prev_hash": self._last_hash,
                "payload": payload,
            }
            canonical = json.dumps(record, ensure_ascii=False, sort_keys=True)
            entry_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            record["entry_hash"] = entry_hash
            with self.chain_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            self._last_hash = entry_hash
            return record

    def verify_chain_integrity(self) -> dict[str, Any]:
        if not self.chain_path.exists():
            return {"valid": True, "records": 0, "broken_at": None}
        prev = "0" * 64
        count = 0
        with self._lock:
            with self.chain_path.open("r", encoding="utf-8") as fh:
                for idx, line in enumerate(fh, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        return {"valid": False, "records": count, "broken_at": idx}
                    if rec.get("prev_hash") != prev:
                        return {"valid": False, "records": count, "broken_at": idx}
                    check_obj = {"prev_hash": rec["prev_hash"], "payload": rec["payload"]}
                    expected = hashlib.sha256(json.dumps(check_obj, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
                    if rec.get("entry_hash") != expected:
                        return {"valid": False, "records": count, "broken_at": idx}
                    prev = expected
                    count += 1
        return {"valid": True, "records": count, "broken_at": None}

    def quarantine_bytes(self, content: bytes, original_name: str, reason: str) -> dict[str, Any]:
        sha256 = hashlib.sha256(content).hexdigest()
        safe_name = f"{sha256[:16]}.quarantine"
        q_path = self.quarantine_dir / safe_name
        q_path.write_bytes(content)
        meta = {
            "sha256": sha256,
            "original_name": original_name,
            "reason": reason,
            "quarantine_file": str(q_path),
            "size_bytes": len(content),
        }
        self.append_record({"forensic_type": "file_quarantine", **meta})
        return meta
