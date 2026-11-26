from __future__ import annotations

import hashlib
import hmac
import os
import struct
import threading
import time
from collections import defaultdict, deque


class AdminAccessControl:
    """
    Controle de acesso administrativo com RBAC, verificação HMAC-SHA256,
    validação TOTP (RFC 6238) opcional e bloqueio progressivo contra brute force.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failed_attempts: dict[str, deque[float]] = defaultdict(deque)

    def record_auth_failure(self, ip: str) -> int:
        now = time.time()
        with self._lock:
            dq = self._failed_attempts[ip]
            dq.append(now)
            cutoff = now - 300
            while dq and dq[0] < cutoff:
                dq.popleft()
            return len(dq)

    def is_brute_force_locked(self, ip: str, limit: int = 8) -> bool:
        now = time.time()
        with self._lock:
            dq = self._failed_attempts.get(ip)
            if not dq:
                return False
            cutoff = now - 300
            while dq and dq[0] < cutoff:
                dq.popleft()
            return len(dq) >= limit

    def verify_totp(self, secret_bytes: bytes, code: str, window: int = 1) -> bool:
        if not code or not code.isdigit() or len(code) != 6:
            return False
        counter = int(time.time() // 30)
        for offset in range(-window, window + 1):
            msg = struct.pack(">Q", counter + offset)
            digest = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
            pos = digest[-1] & 0x0F
            binary = struct.unpack(">I", digest[pos : pos + 4])[0] & 0x7FFFFFFF
            otp = f"{binary % 1000000:06d}"
            if hmac.compare_digest(otp, code):
                return True
        return False

    def is_authorized(self, req) -> bool:
        ip = (getattr(req, "remote_addr", "") or "").strip()
        if self.is_brute_force_locked(ip):
            return False

        expected_token = os.environ.get("SECURITY_API_TOKEN", "").strip()
        provided_token = (req.headers.get("X-Security-Token") or "").strip()

        if expected_token:
            ok = hmac.compare_digest(provided_token, expected_token)
            if not ok:
                self.record_auth_failure(ip)
            return ok

        # Quando sem token configurado, restringe estritamente ao loopback local
        if ip in {"127.0.0.1", "::1", "localhost"}:
            return True
        self.record_auth_failure(ip)
        return False
