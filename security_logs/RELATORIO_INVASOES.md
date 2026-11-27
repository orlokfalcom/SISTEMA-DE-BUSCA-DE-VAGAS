# Relatório Autônomo de Segurança — VagaPulse AI

- **Última atualização (UTC):** `2026-11-27T14:02:24.525494+00:00`
- **Total de tentativas registradas:** `174`
- **Bloqueios autônomos (403):** `110`
- **Severidade:** Crítica `110` | Alta `1` | Média `63` | Baixa `0`

## Origens Mais Frequentes

| IP / Origem | Tentativas |
| :--- | :---: |
| `203.0.113.42` | 50 |
| `198.51.100.99` | 31 |
| `127.0.0.1` | 26 |
| `198.51.100.10` | 15 |
| `198.51.100.11` | 15 |
| `198.51.100.12` | 13 |
| `198.51.100.13` | 12 |
| `198.51.100.200` | 12 |

## Registro Detalhado (Últimos 50 Incidentes)

| Timestamp (UTC) | IP | Método / Rota | Risco | Severidade | Categorias | Ação |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `2026-11-27T14:02:24.521896+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T14:02:24.507968+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-27T14:02:23.410998+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T14:02:22.568078+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-27T14:01:02.877675+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-27T13:58:03.544953+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-27T13:58:02.400937+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-27T13:58:02.352565+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-27T13:44:18.896460+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T13:44:18.865908+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-27T13:44:18.038902+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T13:44:17.206293+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-27T13:43:51.084307+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-27T13:42:19.919531+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-27T13:42:19.903234+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-27T13:42:19.887536+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-27T13:56:09.260202+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T13:56:09.131476+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-27T13:56:03.736868+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T13:56:02.635625+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-27T13:54:48.727556+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-27T13:52:00.340374+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-27T13:52:00.145226+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-27T13:52:00.104319+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-27T14:20:49.105819+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T14:20:48.859929+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-27T14:20:45.694933+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-27T14:20:45.360626+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-27T14:20:23.396784+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-27T14:18:51.746110+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-27T14:18:51.736444+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-27T14:18:51.725480+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:33:39.284592+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:33:39.275158+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:33:38.580506+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:33:38.531364+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T12:33:14.229098+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T12:32:40.644407+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:32:40.633003+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:32:40.625057+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
| `2026-11-26T12:30:21.109148+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:30:21.081527+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T12:30:20.262625+00:00` | `127.0.0.1` | `POST /api/cv/generate` | **57/100** | ALTA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:30:20.224046+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **48/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:30:20.162245+00:00` | `127.0.0.1` | `POST /api/cv/profile` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T12:30:20.055949+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T12:29:49.822170+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T12:29:19.364618+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T12:29:18.770548+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T12:29:18.376623+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
