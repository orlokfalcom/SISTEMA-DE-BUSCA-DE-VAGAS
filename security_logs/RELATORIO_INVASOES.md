# Relatório Autônomo de Segurança — VagaPulse AI

- **Última atualização (UTC):** `2026-11-26T12:53:04.365849+00:00`
- **Total de tentativas registradas:** `117`
- **Bloqueios autônomos (403):** `82`
- **Severidade:** Crítica `82` | Alta `0` | Média `35` | Baixa `0`

## Origens Mais Frequentes

| IP / Origem | Tentativas |
| :--- | :---: |
| `203.0.113.42` | 43 |
| `198.51.100.99` | 24 |
| `127.0.0.1` | 18 |
| `198.51.100.10` | 8 |
| `198.51.100.11` | 8 |
| `198.51.100.12` | 6 |
| `198.51.100.13` | 5 |
| `198.51.100.200` | 5 |

## Registro Detalhado (Últimos 50 Incidentes)

| Timestamp (UTC) | IP | Método / Rota | Risco | Severidade | Categorias | Ação |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `2026-11-26T12:53:04.364591+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:53:04.358434+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:53:04.265142+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T12:52:35.038115+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T12:51:39.475244+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:51:39.467811+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:51:39.458741+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:49:59.295393+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T12:48:27.955624+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:48:27.950153+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:48:27.940670+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:22:53.818075+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:22:53.806807+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:22:53.590980+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T12:22:29.521928+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T12:21:45.072191+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:21:45.065098+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:21:45.053010+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T13:03:26.140150+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T13:03:26.132698+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T13:03:26.044103+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T13:02:18.033279+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T13:01:44.771952+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T13:01:44.724575+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T13:01:44.715654+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:55:19.749686+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:55:19.743905+00:00` | `203.0.113.42` | `GET /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, SQL Injection, XSS / Script Injection, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:55:19.738994+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:55:19.629567+00:00` | `198.51.100.200` | `POST /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:55:19.624623+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T12:54:41.123439+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T12:54:06.160096+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:54:06.100606+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:54:06.092008+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:54:05.996880+00:00` | `198.51.100.10` | `POST /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:54:05.938242+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:53:06.567166+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:53:06.561644+00:00` | `203.0.113.42` | `GET /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, SQL Injection, XSS / Script Injection, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:53:06.557668+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:53:06.467731+00:00` | `198.51.100.12` | `GET /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:53:06.461801+00:00` | `198.51.100.11` | `GET /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:53:06.457524+00:00` | `198.51.100.11` | `GET /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:53:06.450746+00:00` | `198.51.100.10` | `GET /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, Server-Side Template Injection (SSTI), Prototype Pollution, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:53:06.445673+00:00` | `198.51.100.10` | `GET /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:44:50.562044+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:44:50.554564+00:00` | `203.0.113.42` | `GET /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, SQL Injection, XSS / Script Injection, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:44:50.550165+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:22:29.941026+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:22:29.930303+00:00` | `203.0.113.42` | `GET /api/search` | **100/100** | CRÍTICA | IP em Quarentena Autônoma, SQL Injection, XSS / Script Injection, Acesso Não Autorizado | BLOQUEADO (403) |
| `2026-11-26T12:22:29.925118+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
