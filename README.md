# VagaMatch PDF — Busca Inteligente de Vagas & Diagnóstico ATS

Plataforma web de análise de currículos em **PDF** com **Diagnóstico ATS (0–100)**, **Análise de Skill Gap**, **Matching Semântico TF-IDF explicável**, **Comparador de Vaga Colada** e **Rastreador de Candidaturas**.

Funciona de duas formas:
1. **GitHub Pages (100% estático no navegador, pasta `docs/`)** — lê o PDF localmente com **PDF.js**, sem precisar de servidor backend.
2. **Backend Python/Flask (`app.py`)** — servidor WSGI pronto para rodar localmente, em rede LAN, Render, Railway ou Docker/Cloud Run.

---

## Como Publicar no GitHub Pages (Passo a Passo)

1. Inicialize o repositório e envie para o GitHub:
   ```powershell
   git init
   git add .
   git commit -m "Deploy VagaMatch PDF para GitHub Pages"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```

2. No GitHub, abra **Settings → Pages**:
   - **Opção A (Automático via GitHub Actions — recomendado):** em *Build and deployment → Source*, escolha **GitHub Actions**. O workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) publica a pasta `docs/` automaticamente a cada `push`.
   - **Opção B (Sem Actions):** em *Source*, escolha **Deploy from a branch**, selecione a branch **`main`** e a pasta **`/docs`**, e clique em **Save**.

3. Em cerca de 1 minuto, a plataforma estará acessível em:
   ```
   https://SEU-USUARIO.github.io/SEU-REPOSITORIO/
   ```

> **Privacidade no GitHub Pages:** como o processamento do PDF acontece inteiramente no navegador do usuário com PDF.js, nenhum currículo é enviado para servidores externos.

---

## Como Rodar Localmente (Servidor Python/Flask)

```powershell
.\.venv\Scripts\python.exe app.py
```

- Local: `http://localhost:5000`
- Testes automatizados:
  ```powershell
  .\.venv\Scripts\python.exe -m unittest discover -s tests -v
  ```
