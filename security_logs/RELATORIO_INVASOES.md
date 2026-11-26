# Relatório Autônomo de Segurança — VagaPulse AI

- **Última atualização (UTC):** `2026-11-26T12:32:40.645519+00:00`
- **Total de tentativas registradas:** `137`
- **Bloqueios autônomos (403):** `92`
- **Severidade:** Crítica `92` | Alta `1` | Média `44` | Baixa `0`

## Origens Mais Frequentes

| IP / Origem | Tentativas |
| :--- | :---: |
| `203.0.113.42` | 45 |
| `198.51.100.99` | 26 |
| `127.0.0.1` | 21 |
| `198.51.100.10` | 11 |
| `198.51.100.11` | 11 |
| `198.51.100.12` | 9 |
| `198.51.100.13` | 7 |
| `198.51.100.200` | 7 |

## Registro Detalhado (Últimos 50 Incidentes)

| Timestamp (UTC) | IP | Método / Rota | Risco | Severidade | Categorias | Ação |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
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
| `2026-11-26T13:17:35.097960+00:00` | `198.51.100.99` | `GET /api/security/report` | **40/100** | MÉDIA | Acesso Não Autorizado | NEGADO |
| `2026-11-26T13:17:35.091354+00:00` | `203.0.113.42` | `GET /api/search` | **85/100** | CRÍTICA | SQL Injection, XSS / Script Injection | BLOQUEADO (403) |
| `2026-11-26T13:17:34.970778+00:00` | `198.51.100.200` | `POST /api/search` | **90/100** | CRÍTICA | Server-Side Template Injection (SSTI), Credential / API Key Leakage | BLOQUEADO (403) |
| `2026-11-26T13:16:41.352804+00:00` | `198.51.100.13` | `POST /api/search` | **45/100** | MÉDIA | Credential / API Key Leakage | MONITORADO |
| `2026-11-26T13:16:10.246152+00:00` | `198.51.100.12` | `POST /api/search` | **38/100** | MÉDIA | AI Prompt Injection / Jailbreak | MONITORADO |
| `2026-11-26T13:16:10.239882+00:00` | `198.51.100.11` | `POST /api/search` | **100/100** | CRÍTICA | XML External Entity (XXE), Path Traversal / LFI / RFI, SSRF / Cloud Metadata Probing | BLOQUEADO (403) |
| `2026-11-26T13:16:10.225447+00:00` | `198.51.100.10` | `POST /api/search` | **87/100** | CRÍTICA | Server-Side Template Injection (SSTI), Prototype Pollution | BLOQUEADO (403) |
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
