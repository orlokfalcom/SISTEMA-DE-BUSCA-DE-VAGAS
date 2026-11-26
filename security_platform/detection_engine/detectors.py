from __future__ import annotations

import hashlib
import re
from typing import Any


DETECTION_RULES: list[dict[str, Any]] = [
    # 4.2 Web & API Security
    {
        "id": "WEB_SQLI",
        "type": "SQL Injection",
        "weight": 45,
        "mitre": "T1190",
        "owasp": "OWASP-A03",
        "cwe": "CWE-89",
        "regex": re.compile(
            r"(\bunion\b\s+(?:all\s+)?\bselect\b|\bor\b\s+1\s*=\s*1|\band\b\s+1\s*=\s*1|;\s*drop\s+table|\bsleep\s*\(|\bbenchmark\s*\(|\bwaitfor\s+delay\b|'\s*or\s*'1'\s*=\s*'1)",
            re.IGNORECASE,
        ),
        "countermeasure": "Bloquear requisição no WAF e utilizar exclusivamente consultas parametrizadas.",
    },
    {
        "id": "WEB_NOSQLI",
        "type": "NoSQL Injection",
        "weight": 42,
        "mitre": "T1190",
        "owasp": "OWASP-A03",
        "cwe": "CWE-943",
        "regex": re.compile(r"(\$(?:ne|gt|gte|lt|lte|where|regex|in|nin)\b\s*:|\{\s*['\"]\$(?:ne|gt|where)['\"])", re.IGNORECASE),
        "countermeasure": "Validar esquema estrito de tipos e rejeitar operadores $ em entradas JSON.",
    },
    {
        "id": "WEB_XSS",
        "type": "XSS / Script Injection",
        "weight": 40,
        "mitre": "T1059.007",
        "owasp": "OWASP-A03",
        "cwe": "CWE-79",
        "regex": re.compile(r"(<\s*script\b|javascript\s*:|\bon(?:error|load|mouseover|focus|click)\s*=|<\s*iframe\b|<\s*svg\b[^>]*on\w+=)", re.IGNORECASE),
        "countermeasure": "Aplicar codificação contextual de saída, sanitização HTML e Content-Security-Policy (CSP).",
    },
    {
        "id": "WEB_SSTI",
        "type": "Server-Side Template Injection (SSTI)",
        "weight": 45,
        "mitre": "T1190",
        "owasp": "OWASP-A03",
        "cwe": "CWE-1336",
        "regex": re.compile(r"(\{\{\s*(?:7\*7|config|self|__class__|__mro__|lipsum|cycler)\b|\$\{\s*(?:7\*7|T\(|Runtime)|<%.*%>)", re.IGNORECASE),
        "countermeasure": "Nunca interpolar entrada de usuário diretamente em templates; usar sandbox estrito.",
    },
    {
        "id": "WEB_XXE",
        "type": "XML External Entity (XXE)",
        "weight": 45,
        "mitre": "T1190",
        "owasp": "OWASP-A05",
        "cwe": "CWE-611",
        "regex": re.compile(r"(<!DOCTYPE\b[^>]*\[|<!ENTITY\b[^>]*\b(?:SYSTEM|PUBLIC)\b)", re.IGNORECASE),
        "countermeasure": "Desabilitar resolução de entidades externas e DTDs no parser XML.",
    },
    {
        "id": "WEB_LFI_TRAVERSAL",
        "type": "Path Traversal / LFI / RFI",
        "weight": 45,
        "mitre": "T1083",
        "owasp": "OWASP-A01",
        "cwe": "CWE-22",
        "regex": re.compile(r"(\.\./|\.\.\\|%2e%2e%2f|%2e%2e\\|/etc/passwd|/etc/shadow|c:\\windows\\win\.ini|php://filter)", re.IGNORECASE),
        "countermeasure": "Canonicalizar caminhos e restringir leitura ao diretório autorizado.",
    },
    {
        "id": "WEB_RCE_CMDI",
        "type": "Command Injection / RCE",
        "weight": 50,
        "mitre": "T1059",
        "owasp": "OWASP-A03",
        "cwe": "CWE-78",
        "regex": re.compile(r"(;\s*(?:cat|ls|id|whoami|uname|wget|curl|nc|bash|sh)\b|&&\s*(?:whoami|id|cat|cmd|powershell)|`[^`]{2,}`|\$\([^)]+\)|powershell\s+-enc)", re.IGNORECASE),
        "countermeasure": "Eliminar chamadas a shell com entrada de usuário e isolar processos.",
    },
    {
        "id": "WEB_PROTOTYPE_POLLUTION",
        "type": "Prototype Pollution",
        "weight": 42,
        "mitre": "T1190",
        "owasp": "OWASP-API8",
        "cwe": "CWE-1321",
        "regex": re.compile(r"(__proto__|constructor\s*\[\s*['\"]prototype['\"]\s*\]|constructor\.prototype)", re.IGNORECASE),
        "countermeasure": "Bloquear chaves __proto__, constructor e prototype em parsers/merges JSON.",
    },
    {
        "id": "CLOUD_SSRF_METADATA",
        "type": "SSRF / Cloud Metadata Probing",
        "weight": 48,
        "mitre": "T1552.005",
        "owasp": "OWASP-A10",
        "cwe": "CWE-918",
        "regex": re.compile(r"(169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|file://|gopher://)", re.IGNORECASE),
        "countermeasure": "Bloquear IPs privados/link-local e exigir IMDSv2 na infraestrutura cloud.",
    },
    # 4.1 Identity & JWT
    {
        "id": "ID_JWT_ALG_NONE",
        "type": "JWT Vulnerability (alg=none)",
        "weight": 45,
        "mitre": "T1550.001",
        "owasp": "OWASP-A07",
        "cwe": "CWE-347",
        "regex": re.compile(r"(eyJ[A-Za-z0-9_-]*ImFsZyI6Im5vbmUi|\"alg\"\s*:\s*\"none\")", re.IGNORECASE),
        "countermeasure": "Fixar algoritmos assimétricos permitidos e rejeitar tokens sem assinatura válida.",
    },
    # 4.7 Secrets Leakage
    {
        "id": "CLOUD_SECRET_EXPOSURE",
        "type": "Credential / API Key Leakage",
        "weight": 45,
        "mitre": "T1552.001",
        "owasp": "OWASP-API2",
        "cwe": "CWE-798",
        "regex": re.compile(r"(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)"),
        "countermeasure": "Revogar imediatamente o segredo exposto e rotacionar credenciais.",
    },
    # 4.10 AI / LLM Threats (OWASP LLM Top 10)
    {
        "id": "AI_PROMPT_INJECTION",
        "type": "AI Prompt Injection / Jailbreak",
        "weight": 38,
        "mitre": "AML.T0051",
        "owasp": "OWASP-LLM01",
        "cwe": "CWE-77",
        "regex": re.compile(r"(ignore\s+(?:all\s+)?previous\s+instructions|system\s+prompt|jailbreak|<\|im_start\|>|bypass\s+safety\s+filters)", re.IGNORECASE),
        "countermeasure": "Isolar dados não confiáveis de instruções de sistema e validar saídas do modelo.",
    },
    # Recon / Admin Probing
    {
        "id": "RECON_ADMIN_PROBING",
        "type": "Sensitive File / Admin Probing",
        "weight": 38,
        "mitre": "T1595.003",
        "owasp": "OWASP-A05",
        "cwe": "CWE-538",
        "regex": re.compile(r"(^|/)(?:\.env|\.git(?:/|$)|\.htaccess|wp-admin|wp-login\.php|phpmyadmin|actuator|server-status|config\.php|backup\.sql|admin(?:/|$))", re.IGNORECASE),
        "countermeasure": "Bloquear acesso externo a arquivos de configuração e rotas administrativas.",
    },
]

# Regras estáticas estilo YARA para inspeção de arquivos/PDFs
MALWARE_STATIC_SIGNATURES: list[tuple[str, str, str, bytes]] = [
    ("EICAR_TEST_FILE", "Test Malware Signature (EICAR)", "T1204", b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"),
    ("PDF_EMBEDDED_JS", "PDF com JavaScript Embutido", "T1059.007", b"/JavaScript"),
    ("PDF_LAUNCH_ACTION", "PDF com Ação /Launch (Execução Externa)", "T1204.002", b"/Launch"),
    ("PDF_OPEN_ACTION", "PDF com Auto-Execução (/OpenAction)", "T1204.002", b"/OpenAction"),
    ("PE_EXECUTABLE", "Executável Windows (MZ/PE) disfarçado", "T1036", b"MZ"),
]


def inspect_file_static(file_bytes: bytes, filename: str = "") -> dict[str, Any]:
    sha256 = hashlib.sha256(file_bytes).hexdigest()
    findings: list[dict[str, Any]] = []
    risk_score = 0

    for sig_id, desc, mitre, pattern in MALWARE_STATIC_SIGNATURES:
        if sig_id == "PE_EXECUTABLE" and not file_bytes.startswith(b"MZ"):
            continue
        if pattern in file_bytes:
            weight = 75 if sig_id in ("EICAR_TEST_FILE", "PE_EXECUTABLE", "PDF_LAUNCH_ACTION") else 35
            risk_score += weight
            findings.append({"rule_id": sig_id, "description": desc, "mitre_attack": mitre, "weight": weight})

    if filename.lower().endswith(".pdf") and not file_bytes.lstrip().startswith(b"%PDF-"):
        risk_score += 55
        findings.append({
            "rule_id": "MAGIC_BYTES_MISMATCH",
            "description": "Extensão .pdf sem assinatura mágica %PDF- válida.",
            "mitre_attack": "T1036.008",
            "weight": 55,
        })

    risk_score = min(100, risk_score)
    return {
        "filename": filename,
        "size_bytes": len(file_bytes),
        "sha256": sha256,
        "risk_score": risk_score,
        "malicious": risk_score >= 60,
        "findings": findings,
    }
