# VagaPulse AI 2.0 — Arquitetura Antifraude, Ghost Jobs e Segurança

## 1. Arquitetura Multicamadas (`docs/js/fraud/`)

| Camada | Módulo | Responsabilidade |
| :--- | :--- | :--- |
| **Camada 1** | `lexicalAnalyzer.js` | Análise linguística e semântica (PT, EN, ES, FR) com *negation guards* contextuais |
| **Camada 2** | `domainAnalyzer.js` | Inteligência de URLs, proteção SSRF, typosquatting (Levenshtein), punycode, shorteners e TLDs |
| **Camada 3** | `companyAnalyzer.js` | Coerência empresa–domínio, ATS confiáveis, sem invenção de CNPJ/avaliações |
| **Camada 4** | `ghostJobDetector.js` | Classificação independente de Ghost Jobs (`Recente`, `Possivelmente desatualizada`, `Suspeita de Ghost Job`, `Forte evidência de anúncio inativo`) |
| **Camada 5** | `behaviorAnalyzer.js` | Campanhas em massa via `FNV-1a` + `SimHash` 32-bit, contatos/domínios reutilizados |
| **Camada 6** | `salaryAnalyzer.js` | Coerência salarial contextual por moeda, período e senioridade |
| **Camada 7** | `phishingDetector.js` | Detecção de coleta precoce de CPF/RG/CNH/SSN/cartão/2FA/selfies |
| **IA & Threat Intel** | `aiDetector.js`, `threatIntelligence.js` | Conectores opcionais com sandboxing anti-prompt-injection e fallback determinístico |
| **Motor de Risco** | `riskEngine.js` | Pontuação ponderada `0–100` com deduplicação por `ruleId`, caps por categoria e índice de confiança |

---

## 2. Pesos e Caps por Categoria (`CATEGORY_CAPS`)

- `payment_request`: **25 pts**
- `phishing_data`: **20 pts**
- `domain_url`: **15 pts**
- `company_inconsistency`: **15 pts**
- `financial_promises`: **10 pts**
- `fraudulent_behavior`: **10 pts**
- `ad_quality`: **5 pts**

Correlação cruzada aplica bônus de risco quando há combinação crítica (ex.: `payment_request` + `phishing_data`).

### Classificação Final
- `Dados insuficientes` (quando há pouca evidência e risco zero — **nunca** afirma `"Verificada"` por ausência de sinais)
- `0–19`: `Sem sinais relevantes identificados`
- `20–39`: `Atenção`
- `40–59`: `Suspeita`
- `60–79`: `Alto risco` (`isFake: true`)
- `80–100`: `Risco crítico` (`isFake: true`)

---

## 3. Como Executar os Testes

1. Sirva a pasta `docs/`: `.\.venv\Scripts\python.exe -m http.server 8080 -d docs`
2. Abra `http://127.0.0.1:8080/tests/fraud-runner.html` para o benchmark de **108 cenários** (Matriz de Confusão, Precision, Recall, F1, FPR, FNR).
3. Abra `http://127.0.0.1:8080/tests/test-runner.html` para a suíte principal do VagaPulse AI.
