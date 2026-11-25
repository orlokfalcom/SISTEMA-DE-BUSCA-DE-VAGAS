# VagaPulse AI — Busca Profunda de Vagas & Editor de Currículo ATS

Plataforma web responsiva com processamento **100% privado no navegador** (módulos ES, sem dependências de servidor na pasta `docs/`), análise de currículos em **PDF**, **Motor de Matching Híbrido (Skills Exatas + Grafo de Competências + Embeddings MiniLM / BM25 + Senioridade Gradativa)**, **Índice Invertido sub-10ms**, **Web Workers**, **Feedback Loop local (`IndexedDB`)**, **Editor de Currículo ATS ao Vivo** e **Rastreador de Candidaturas**.

## Arquitetura Modular (`docs/`)
- `docs/js/nlp.js` — Extração canônica de currículo e vagas, normalização léxica PT-BR/EN, aliases de skills, grafo de competências (`SKILL_GRAPH`) e parsing tolerante de senioridade e anos de experiência.
- `docs/js/index.js` — Índice invertido em memória (`InvertedIndex`) com BM25 ponderado por campo para busca sub-10ms.
- `docs/js/dedup.js` — Deduplicação por URL canônica e similaridade fuzzy de título + empresa (`Jaccard >= 0.85`).
- `docs/js/matcher.js` — Score híbrido explicável (0–100, faixas Alta/Média/Baixa), decomposição e highlight de termos, adaptação de pesos por feedback (👍/👎), `Precision@10` e pitch bilíngue (PT-BR/EN).
- `docs/js/fetcher.js` — Coleta paralela com pool de concorrência (limite 5), retry com backoff exponencial, cache TTL por fonte e telemetria de latência.
- `docs/js/workers/nlp.worker.js` & `docs/js/workers/embeddings.worker.js` — Execução fora da thread de UI com lazy-load de `Xenova/all-MiniLM-L6-v2` (Transformers.js) e fallback elegante para BM25.
- `docs/js/storage.js`, `docs/js/ats.js`, `docs/js/app.js` — Persistência local (`IndexedDB` / `localStorage`), editor ATS com debounce e renderização incremental (`IntersectionObserver`).
- Documentação matemática e pesos default: [`docs/MATHEMATICS.md`](docs/MATHEMATICS.md).

## Principais Recursos
- **Busca Profunda Multi-Fonte (Empresas + Portais):**
  - **Páginas de Carreiras Diretas (Brasil):** Nubank, Stone, VTEX, QuintoAndar, EBANX, Wellhub (Gympass), Brex e Bosch Brasil.
  - **Páginas de Carreiras Diretas (Globais):** OpenAI, Cloudflare, GitLab, Elastic, Datadog, MongoDB, Canonical, Okta, Zscaler, Databricks, Notion, Supabase e Vanta.
  - **9 Portais & Comunidades Ao Vivo:** Remotive, Jobicy, Arbeitnow, RemoteOK, Working Nomads, Landing.jobs, Himalayas, We Work Remotely e GitHub Vagas Brasil.
  - **14 Links de Busca Profunda:** Google Jobs, LinkedIn, Gupy, Catho, Vagas.com.br, InfoJobs, Indeed Brasil, Glassdoor Brasil, Programathor, GeekHunter, Wellfound e buscas diretas em sites de empresas (`Greenhouse`, `Ashby`, `Lever`, `Gupy`).
- **Prioridade Geográfica Automática:** detecta o país no currículo (ex.: Brasil) e prioriza empresas locais no ranking sem excluir oportunidades globais/remotas.
- **Editor de Currículo ATS ao Vivo:** janela em tela dividida com o texto do currículo à esquerda (auto-correção, modelo ATS, cópia, download `.TXT` e impressão/PDF) e checklist vivo de melhorias à direita com clique para localizar o trecho no editor.
- **Totalmente Responsivo:** adaptado para desktop, tablet e smartphone.

---

## Como Usar na Prática (Windows — 1 Clique)

Basta dar duplo clique em **`iniciar_vagamatch.bat`** na pasta do projeto. Ele inicia o servidor de produção (`Waitress`) e abre automaticamente `http://127.0.0.1:5000` no navegador.

Ou via terminal PowerShell:
```powershell
.\.venv\Scripts\python.exe app.py
```

- Acesso local: `http://127.0.0.1:5000`
- Testes backend Python:
  ```powershell
  .\.venv\Scripts\python.exe -m unittest discover -s tests -v
  ```
- Testes do Motor de Matching & NLP (módulos ES no navegador):
  Sirva a pasta `docs/` (ex.: `python -m http.server 8080 -d docs`) e abra `http://127.0.0.1:8080/tests/test-runner.html`.

---

## Como Publicar no GitHub Pages (Pasta `docs/`)

1. Envie o repositório para o GitHub (`git push`).
2. Em **Settings → Pages**, escolha **GitHub Actions** (workflow [.github/workflows/pages.yml](.github/workflows/pages.yml)) ou **Deploy from a branch** (`main` / `/docs`).
3. Em cerca de 1 minuto a versão estática estará online em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.
