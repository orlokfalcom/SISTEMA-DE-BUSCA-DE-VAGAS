# VagaPulse AI — Documentação Matemática e Pesos Default

Este documento descreve as fórmulas de extração, indexação, matching híbrido, adaptação por feedback e avaliação de qualidade do **VagaPulse AI**, implementadas integralmente no navegador em módulos ES (`docs/js/`).

---

## 1. Pesos Default (`DEFAULT_WEIGHTS`)

Definidos em `docs/js/matcher.js`:

| Sinal | Chave | Peso Default | Papel no Score |
| :--- | :--- | :---: | :--- |
| Skills Exatas | `exactSkills` | **0.42** | Cobertura de skills canônicas exigidas pela vaga |
| Skills Relacionadas (Grafo) | `relatedSkills` | **0.13** | Competências adjacentes via grafo de skills |
| Similaridade Semântica + BM25 | `semantic` | **0.22** | Embeddings locais (`MiniLM`) combinados com sinal léxico `BM25` |
| Aderência de Senioridade | `seniority` | **0.13** | Penalidade gradativa por distância de nível (1–5) |
| Cargo / Setor | `roleSector` | **0.10** | Alinhamento de título/cargo sugerido e setor |

> Todos os pesos são normalizados para soma `1.0` ($\sum_i w_i = 1$) tanto no default quanto após atualizações por feedback.

---

## 2. Score Final Híbrido (0–100)

Para um candidato $C$ e uma vaga $J$:

$$\text{Score}(C, J) = \text{clamp}\left(\text{round}\left(100 \cdot \sum_{k \in \mathcal{K}} w_k \cdot s_k(C, J)\right),\, 0,\, 100\right)$$

onde $\mathcal{K} = \{\text{exactSkills}, \text{relatedSkills}, \text{semantic}, \text{seniority}, \text{roleSector}\}$.

### Faixas de Classificação

- **Alta**: $\text{Score} \ge 80$
- **Média**: $60 \le \text{Score} \le 79$
- **Baixa**: $\text{Score} < 60$

---

## 3. Componentes do Score

### 3.1. Skills Exatas (`exactSkills`)

Após normalização léxica e resolução de aliases (ex.: `"JS"` $\to$ `"JavaScript"`, `"K8s"` $\to$ `"Kubernetes"`, `"reactjs"` $\to$ `"React"`), sejam $S_C$ as skills canônicas do candidato e $S_J$ as skills extraídas da vaga:

$$s_{\text{exact}} = \begin{cases}
\dfrac{|S_C \cap S_J|}{|S_J|}, & \text{se } |S_J| > 0 \\[8pt]
0.55, & \text{se } |S_J| = 0 \text{ (vaga sem skills explícitas)}
\end{cases}$$

### 3.2. Skills Relacionadas via Grafo de Competências (`relatedSkills`)

Para cada skill ausente $m \in (S_J \setminus S_C)$, busca-se o menor caminho em largura (BFS, até `maxHops = 2`) no grafo não-direcionado `SKILL_GRAPH` até alguma skill $c \in S_C$:

- **Distância 1 hop** (ex.: `React` $\leftrightarrow$ `Next.js` ou `TypeScript`): peso `0.55`
- **Distância 2 hops** (ex.: `React` $\leftrightarrow$ `TypeScript` $\leftrightarrow$ `Node.js`): peso `0.25`

$$s_{\text{related}} = \min\left(1,\; \frac{\sum_{m \in (S_J \setminus S_C)} \text{decay}(\text{dist}(S_C, m))}{\max(1, |S_J|)}\right)$$

### 3.3. Similaridade Semântica Local + BM25 (`semantic`)

1. **Sinal Léxico (BM25 ponderado por campo)** — implementado em `docs/js/index.js`:
   Pesos de campo: `title = 3.0`, `skills = 2.5`, `company/location/sector = 1.5`, `description = 1.0`.
   Para cada termo $t$ da consulta, com parâmetros $k_1 = 1.5$ e $b = 0.75$:

   $$\text{IDF}(t) = \ln\left(1 + \frac{N - df(t) + 0.5}{df(t) + 0.5}\right)$$

   $$\text{BM25}(q, d) = \sum_{t \in q} \text{IDF}(t) \cdot \frac{tf_{w}(t, d) \cdot (k_1 + 1)}{tf_{w}(t, d) + k_1 \cdot \left(1 - b + b \cdot \frac{|d|}{\text{avgdl}}\right)}$$

   O valor bruto é normalizado via saturação suave para $[0, 1]$.

2. **Sinal Semântico Local (`Xenova/all-MiniLM-L6-v2` quantizado `q8`)** — executado em Web Worker (`docs/js/workers/embeddings.worker.js`):
   Calcula-se a similaridade do cosseno entre o vetor do currículo $\mathbf{e}_C$ e o vetor da vaga $\mathbf{e}_J$:

   $$\cos(\mathbf{e}_C, \mathbf{e}_J) = \frac{\mathbf{e}_C \cdot \mathbf{e}_J}{\|\mathbf{e}_C\|_2 \|\mathbf{e}_J\|_2}$$

3. **Combinação e Degradação Elegante**:
   - Quando ambos os embeddings estão disponíveis: sinal híbrido combina similaridade semântica (MiniLM) e sinal léxico (`BM25`).
   - **Fallback automático**: se WebAssembly/CDN/modelo não estiver disponível ou ainda estiver carregando, `semantic` degrada graciosamente para `BM25` normalizado, sem bloquear a UI.

### 3.4. Aderência de Senioridade com Penalidade Gradativa (`seniority`)

Níveis canônicos: `1 = Estágio`, `2 = Júnior`, `3 = Pleno`, `4 = Sênior`, `5 = Especialista`.
Diferença absoluta $\Delta = |L_C - L_J|$ nunca elimina a vaga de forma binária; aplica-se decaimento gradativo:

- $\Delta = 0$: `1.00`
- $\Delta = 1$: `0.78`
- $\Delta = 2$: `0.50`
- $\Delta = 3$: `0.28`
- $\Delta \ge 4$: `0.15`

### 3.5. Cargo e Setor (`roleSector`)

Combina correspondência entre títulos/cargos sugeridos para o perfil e o título normalizado da vaga com a coincidência de setor (`Tecnologia`, `Dados & IA`, `Produto`, `Design`, etc.).

---

## 4. Deduplicação Fuzzy (`docs/js/dedup.js`)

As vagas coletadas em paralelo passam por duas camadas de deduplicação:

1. **URL canônica**: remoção de parâmetros de tracking (`utm_*`, `ref`, `source`, `fbclid`, `gclid`) e normalização de barra final.
2. **Similaridade de Jaccard sobre tokens de `(título + empresa)`**:

$$J(A, B) = \frac{|A \cap B|}{|A \cup B|} \ge 0.85$$

---

## 5. Feedback Loop Local e `Precision@10`

- **Adaptação de pesos (`adaptWeightsFromFeedback`)**:
  Ao receber feedback explícito do usuário (`+1` para 👍 ou `-1` para 👎), os pesos são ajustados por gradiente proporcional ao vetor de sinais `breakdown` da vaga com taxa de aprendizado $\eta = 0.035$ e renormalizados com piso mínimo por componente para evitar colapso de qualquer sinal.
- **Persistência**: `IndexedDB` (`vagapulse_ai_db`) com fallback automático para `localStorage`.
- **Qualidade do Ranking (`Precision@10`)**:

$$\text{Precision@10} = \frac{\text{itens positivos no Top-10}}{\text{itens avaliados no Top-10}}$$

considerando votos positivos/negativos e cliques registrados no Top-10 ranqueado.

---

## 6. Tie-Breaking na Ordenação

Empates no `score` final são resolvidos nesta ordem:
1. Prioridade geográfica compatível com o país/localização do candidato
2. Recência da publicação (`posted_at`)
3. Confiança da fonte (`sourceTrust`)
