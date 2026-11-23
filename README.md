# VagaMatch PDF — Busca Profunda de Vagas & Editor de Currículo ATS

Plataforma web responsiva de análise de currículos em **PDF** com **Busca Profunda em Sites de Empresas e Portais da Internet**, **Editor de Currículo ATS em Tempo Real**, **Diagnóstico ATS (0–100)**, **Análise de Skill Gap**, **Matching Semântico TF-IDF com Prioridade Geográfica**, **Comparador de Vaga Colada** e **Rastreador de Candidaturas**.

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
- Testes automatizados:
  ```powershell
  .\.venv\Scripts\python.exe -m unittest discover -s tests -v
  ```

---

## Como Publicar no GitHub Pages (Pasta `docs/`)

1. Envie o repositório para o GitHub (`git push`).
2. Em **Settings → Pages**, escolha **GitHub Actions** (workflow [.github/workflows/pages.yml](.github/workflows/pages.yml)) ou **Deploy from a branch** (`main` / `/docs`).
3. Em cerca de 1 minuto a versão estática estará online em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.
