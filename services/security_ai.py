from __future__ import annotations

import json
import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from security_platform.behavioral_analysis.correlator import ThreatCorrelator
from security_platform.core.events import SecurityEvent
from security_platform.detection_engine.detectors import DETECTION_RULES, inspect_file_static
from security_platform.forensic.custody_log import ForensicCustodyLog
from security_platform.identity_security.admin_rbac import AdminAccessControl
from security_platform.soar.playbook_engine import SoarPlaybookEngine
from security_platform.vulnerability_management.sca_scanner import scan_dependencies_osv


THREAT_RULES: list[tuple[str, int, re.Pattern[str], str]] = [
    (
        "SQL Injection",
        45,
        re.compile(
            r"(\bunion\b\s+\bselect\b|\bor\b\s+1\s*=\s*1|\band\b\s+1\s*=\s*1|;\s*drop\s+table|\bsleep\s*\(|\bbenchmark\s*\(|\bwaitfor\s+delay\b|'\s*or\s*'1'\s*=\s*'1)",
            re.IGNORECASE,
        ),
        "Padrão típico de injeção SQL detectado na requisição.",
    ),
    (
        "XSS / Script Injection",
        40,
        re.compile(
            r"(<\s*script\b|javascript\s*:|\bon(?:error|load|mouseover|focus)\s*=|<\s*iframe\b|<\s*svg\b[^>]*on\w+=)",
            re.IGNORECASE,
        ),
        "Tentativa de injeção de script/XSS detectada.",
    ),
    (
        "Path Traversal / LFI",
        45,
        re.compile(
            r"(\.\./|\.\.\\|%2e%2e%2f|%2e%2e\\|/etc/passwd|/etc/shadow|c:\\windows\\win\.ini|boot\.ini)",
            re.IGNORECASE,
        ),
        "Tentativa de travessia de diretórios ou leitura de arquivo local.",
    ),
    (
        "Command Injection / RCE",
        50,
        re.compile(
            r"(;\s*(?:cat|ls|id|whoami|uname|wget|curl|nc|bash|sh)\b|&&\s*(?:whoami|id|cat|cmd|powershell)|`[^`]{2,}`|\$\([^)]+\)|powershell\s+-enc)",
            re.IGNORECASE,
        ),
        "Tentativa de execução remota de comandos.",
    ),
    (
        "SSRF / Metadata Probing",
        45,
        re.compile(
            r"(169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|file://|gopher://)",
            re.IGNORECASE,
        ),
        "Tentativa de acesso a metadados internos ou SSRF.",
    ),
    (
        "Sensitive File / Admin Probing",
        38,
        re.compile(
            r"(^|/)(?:\.env|\.git(?:/|$)|\.htaccess|wp-admin|wp-login\.php|phpmyadmin|actuator|server-status|config\.php|backup\.sql|admin(?:/|$))",
            re.IGNORECASE,
        ),
        "Varredura de rota administrativa ou arquivo sensível.",
    ),
]


def _sanitize_excerpt(raw: str, max_len: int = 240) -> str:
    cleaned = re.sub(r"[\r\n\t]+", " ", str(raw or "")).strip()
    if len(cleaned) > max_len:
        return cleaned[:max_len] + "..."
    return cleaned


def _severity_from_score(score: int) -> str:
    if score >= 80:
        return "CRÍTICA"
    if score >= 55:
        return "ALTA"
    if score >= 30:
        return "MÉDIA"
    return "BAIXA"


class AutonomousSecurityAI:
    """
    Motor autônomo de IA para detecção de tentativas de invasão, acessos não autorizados
    e anomalias comportamentais, com persistência automática de documentos de auditoria.
    """

    def __init__(
        self,
        log_dir: str | os.PathLike[str] = "security_logs",
        block_threshold: int = 80,
        burst_limit_30s: int = 45,
        quarantine_seconds: int = 120,
    ) -> None:
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.jsonl_path = self.log_dir / "intrusion_attempts.jsonl"
        self.report_path = self.log_dir / "RELATORIO_INVASOES.md"

        self.block_threshold = block_threshold
        self.burst_limit_30s = burst_limit_30s
        self.quarantine_seconds = quarantine_seconds

        self._lock = threading.Lock()
        self._ip_requests: dict[str, deque[float]] = defaultdict(deque)
        self._ip_risk_memory: dict[str, float] = defaultdict(float)
        self._ip_quarantine_until: dict[str, float] = {}
        self._incidents: list[dict[str, Any]] = self._load_existing_incidents()
        self.forensics = ForensicCustodyLog(self.log_dir)
        self.correlator = ThreatCorrelator(window_seconds=300)
        self.soar = SoarPlaybookEngine()
        self.rbac = AdminAccessControl()

    def _load_existing_incidents(self) -> list[dict[str, Any]]:
        if not self.jsonl_path.exists():
            return []
        loaded: list[dict[str, Any]] = []
        try:
            with self.jsonl_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        loaded.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        except OSError:
            return []
        return loaded[-500:]

    def _prune_and_track_velocity(self, ip: str, now: float) -> int:
        dq = self._ip_requests[ip]
        dq.append(now)
        cutoff = now - 30.0
        while dq and dq[0] < cutoff:
            dq.popleft()
        return len(dq)

    def _is_local_ip(self, ip: str) -> bool:
        return ip in {"127.0.0.1", "::1", "localhost", ""}

    def analyze_payload(
        self,
        *,
        ip: str,
        method: str,
        path: str,
        query_string: str = "",
        body_text: str = "",
        headers: dict[str, str] | None = None,
        status_override: int | None = None,
        explicit_reason: str = "",
    ) -> dict[str, Any]:
        now = time.time()
        headers = headers or {}
        req_count_30s = self._prune_and_track_velocity(ip, now)

        risk_score = 0
        categories: list[str] = []
        signals: list[str] = []

        # Decaimento adaptativo da memória de risco do IP
        prev_mem = self._ip_risk_memory.get(ip, 0.0)
        self._ip_risk_memory[ip] = max(0.0, prev_mem * 0.92)

        # 1. Verifica se IP está em quarentena autônoma
        q_until = self._ip_quarantine_until.get(ip, 0.0)
        if q_until > now:
            risk_score += 55
            categories.append("IP em Quarentena Autônoma")
            signals.append(f"IP bloqueado temporariamente ({int(q_until - now)}s restantes)")

        # 2. Análise lexical / vetores de ataque OWASP, MITRE ATT&CK e LLM Top 10
        ua = headers.get("User-Agent", "")
        combined_surface = f"{path}?{query_string}\n{body_text}\n{ua}"
        mitre_hits: list[str] = []
        owasp_hits: list[str] = []
        cwe_hits: list[str] = []
        countermeasures: list[str] = []

        for rule in DETECTION_RULES:
            if rule["regex"].search(combined_surface):
                risk_score += rule["weight"]
                categories.append(rule["type"])
                signals.append(f"[{rule['mitre']} / {rule['cwe']}] {rule['type']} detectado.")
                mitre_hits.append(rule["mitre"])
                owasp_hits.append(rule["owasp"])
                cwe_hits.append(rule["cwe"])
                countermeasures.append(rule["countermeasure"])

        # 3. Ferramentas automatizadas de ataque / scanners conhecidos
        if re.search(r"\b(sqlmap|nikto|nessus|acunetix|masscan|hydra|dirbuster|gobuster|nuclei)\b", ua, re.IGNORECASE):
            risk_score += 45
            categories.append("Scanner / Ferramenta Ofensiva")
            signals.append(f"User-Agent suspeito detectado: {_sanitize_excerpt(ua, 80)}")

        # 4. Anomalia comportamental por velocidade (burst)
        if req_count_30s > self.burst_limit_30s:
            risk_score += 35
            categories.append("Anomalia de Taxa (Burst)")
            signals.append(f"{req_count_30s} requisições em 30s (limite {self.burst_limit_30s})")

        # 5. Acesso não autorizado explícito (401/403) ou spoofing de cabeçalho
        if status_override in (401, 403):
            risk_score += 40
            categories.append("Acesso Não Autorizado")
            signals.append(explicit_reason or f"Tentativa bloqueada com HTTP {status_override} em {path}")

        if status_override == 404 and re.search(r"(\.php|\.asp|\.env|\.git|admin|login|backup)", path, re.IGNORECASE):
            risk_score += 32
            categories.append("Enumeração de Rotas (404)")
            signals.append(f"Sondagem de recurso inexistente: {path}")

        # Soma memória adaptativa de reincidência do IP
        if risk_score > 0:
            risk_score = min(100, int(round(risk_score + min(25.0, self._ip_risk_memory[ip]))))
            self._ip_risk_memory[ip] = min(40.0, self._ip_risk_memory[ip] + risk_score * 0.25)

        blocked = risk_score >= self.block_threshold
        soar_action = None
        if blocked and not self._is_local_ip(ip):
            self._ip_quarantine_until[ip] = now + self.quarantine_seconds
            soar_action = self.soar.execute_action(
                action="block_ip",
                target=ip,
                reason=f"Bloqueio autônomo: {', '.join(dict.fromkeys(categories)) or 'risco elevado'}",
            )

        severity = _severity_from_score(risk_score)
        should_log = risk_score >= 30 or status_override in (401, 403)

        incident = None
        correlated_incident = None
        if should_log:
            sec_event = SecurityEvent(
                source=ip or "unknown",
                event_type=(categories[0] if categories else "Anomalia"),
                asset=path,
                indicators=list(dict.fromkeys(categories)),
                mitre_attack=list(dict.fromkeys(mitre_hits)),
                owasp_category=list(dict.fromkeys(owasp_hits)),
                cwe=list(dict.fromkeys(cwe_hits)),
                evidence=_sanitize_excerpt(f"{query_string} {body_text}".strip() or path, 180),
                confidence=min(99, 55 + len(signals) * 12),
                severity=severity,
                risk_score=risk_score,
                recommended_countermeasure=countermeasures[0] if countermeasures else "Monitorar origem e revisar logs.",
                status="blocked" if blocked else "monitored",
            )
            corr = self.correlator.ingest(sec_event)
            if corr:
                correlated_incident = corr.to_dict()

            incident = {
                "event_id": sec_event.event_id,
                "timestamp": sec_event.timestamp,
                "ip": ip or "unknown",
                "method": method,
                "path": path,
                "risk_score": risk_score,
                "severity": severity,
                "categories": list(dict.fromkeys(categories)),
                "mitre_attack": sec_event.mitre_attack,
                "owasp_category": sec_event.owasp_category,
                "cwe": sec_event.cwe,
                "signals": signals,
                "action_taken": "BLOQUEADO (403)" if blocked else ("NEGADO" if status_override in (401, 403) else "MONITORADO"),
                "payload_excerpt": sec_event.evidence,
                "soar_action_id": soar_action["action_id"] if soar_action else None,
            }
            self._persist_incident(incident)
            self.forensics.append_record(incident)

        return {
            "risk_score": risk_score,
            "severity": severity,
            "categories": list(dict.fromkeys(categories)),
            "mitre_attack": list(dict.fromkeys(mitre_hits)),
            "signals": signals,
            "blocked": blocked,
            "incident": incident,
            "correlated_incident": correlated_incident,
        }

    def _persist_incident(self, incident: dict[str, Any]) -> None:
        with self._lock:
            self._incidents.append(incident)
            if len(self._incidents) > 500:
                self._incidents = self._incidents[-500:]

            with self.jsonl_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(incident, ensure_ascii=False) + "\n")

            self._write_markdown_report_locked()

    def _write_markdown_report_locked(self) -> None:
        total = len(self._incidents)
        blocked_count = sum(1 for i in self._incidents if "BLOQUEADO" in str(i.get("action_taken", "")))
        by_sev: dict[str, int] = defaultdict(int)
        by_ip: dict[str, int] = defaultdict(int)
        for inc in self._incidents:
            by_sev[inc.get("severity", "BAIXA")] += 1
            by_ip[inc.get("ip", "unknown")] += 1

        top_ips = sorted(by_ip.items(), key=lambda x: x[1], reverse=True)[:10]
        recent = list(reversed(self._incidents[-50:]))

        lines = [
            "# Relatório Autônomo de Segurança — VagaPulse AI",
            "",
            f"- **Última atualização (UTC):** `{datetime.now(timezone.utc).isoformat()}`",
            f"- **Total de tentativas registradas:** `{total}`",
            f"- **Bloqueios autônomos (403):** `{blocked_count}`",
            f"- **Severidade:** Crítica `{by_sev['CRÍTICA']}` | Alta `{by_sev['ALTA']}` | Média `{by_sev['MÉDIA']}` | Baixa `{by_sev['BAIXA']}`",
            "",
            "## Origens Mais Frequentes",
            "",
            "| IP / Origem | Tentativas |",
            "| :--- | :---: |",
        ]
        if top_ips:
            for ip, cnt in top_ips:
                lines.append(f"| `{ip}` | {cnt} |")
        else:
            lines.append("| — | 0 |")

        lines.extend(
            [
                "",
                "## Registro Detalhado (Últimos 50 Incidentes)",
                "",
                "| Timestamp (UTC) | IP | Método / Rota | Risco | Severidade | Categorias | Ação |",
                "| :--- | :--- | :--- | :---: | :---: | :--- | :--- |",
            ]
        )
        for inc in recent:
            cats = ", ".join(inc.get("categories") or ["Anomalia"])
            route = f"`{inc.get('method', 'GET')} {inc.get('path', '/')}`".replace("|", "/")
            lines.append(
                f"| `{inc.get('timestamp', '')}` | `{inc.get('ip', '')}` | {route} | "
                f"**{inc.get('risk_score', 0)}/100** | {inc.get('severity', '')} | {cats} | {inc.get('action_taken', '')} |"
            )

        self.report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def inspect_flask_request(self, req: Any) -> dict[str, Any]:
        ip = (req.remote_addr or "127.0.0.1").strip()
        query_string = req.query_string.decode("utf-8", errors="ignore") if req.query_string else ""
        body_text = ""
        if req.method in ("POST", "PUT", "PATCH"):
            if req.is_json:
                body_text = req.get_data(as_text=True)[:2000]
            elif req.form:
                body_text = " ".join(f"{k}={v}" for k, v in req.form.items())[:2000]
            elif req.files:
                body_text = " ".join(f"file:{f.filename}" for f in req.files.values() if getattr(f, "filename", None))
        return self.analyze_payload(
            ip=ip,
            method=req.method,
            path=req.path,
            query_string=query_string,
            body_text=body_text,
            headers=dict(req.headers),
        )

    def observe_flask_response(self, req: Any, status_code: int) -> None:
        if status_code not in (401, 403, 404):
            return
        ip = (req.remote_addr or "127.0.0.1").strip()
        query_string = req.query_string.decode("utf-8", errors="ignore") if req.query_string else ""
        self.analyze_payload(
            ip=ip,
            method=req.method,
            path=req.path,
            query_string=query_string,
            headers=dict(req.headers),
            status_override=status_code,
        )

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            total = len(self._incidents)
            blocked = sum(1 for i in self._incidents if "BLOQUEADO" in str(i.get("action_taken", "")))
            mitre_all = sorted({m for i in self._incidents for m in i.get("mitre_attack", [])})
            return {
                "total_incidents": total,
                "blocked_count": blocked,
                "jsonl_path": str(self.jsonl_path),
                "report_path": str(self.report_path),
                "recent_incidents": list(reversed(self._incidents[-20:])),
                "mitre_techniques": mitre_all,
                "correlated_incidents": self.correlator.get_incidents(15),
                "soar_blocked_ips": self.soar.blocked_ips,
                "soar_history": self.soar.execution_history[-20:],
                "forensic_chain": self.forensics.verify_chain_integrity(),
            }

    def scan_and_quarantine_file(self, content: bytes, filename: str) -> dict[str, Any]:
        scan = inspect_file_static(content, filename)
        if scan["malicious"]:
            q_meta = self.forensics.quarantine_bytes(content, filename, "Malware/Exploit estático detectado")
            scan["quarantined"] = True
            scan["quarantine"] = q_meta
        else:
            scan["quarantined"] = False
        return scan

    def run_sca_scan(self) -> dict[str, Any]:
        return scan_dependencies_osv()

    def is_authorized_for_security_api(self, req: Any) -> bool:
        return self.rbac.is_authorized(req)
