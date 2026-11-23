from __future__ import annotations

import math
import re
from collections import Counter

from services.resume_parser import RELATED_SKILLS, extract_skills, normalize_text

STOPWORDS = {
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "para", "por",
    "com", "sem", "que", "uma", "um", "uns", "umas", "como", "mais", "menos", "sobre",
    "entre", "ate", "apos", "ser", "ter", "fazer", "the", "and", "for", "with", "that",
    "this", "from", "are", "you", "your", "our", "will", "have", "has", "not", "all",
    "vaga", "empresa", "equipe", "time", "atuar", "experiencia", "conhecimento",
}

SENIORITY_RANK = {
    "Estágio / Trainee": 1,
    "Júnior": 2,
    "Pleno": 3,
    "Sênior": 4,
    "Sênior / Liderança": 5,
}


def _tokenize(text: str) -> list[str]:
    norm = normalize_text(text)
    tokens = re.findall(r"[a-z0-9+#]{2,}", norm)
    return [t for t in tokens if t not in STOPWORDS]


def _compute_idf(doc_counters: list[Counter]) -> dict[str, float]:
    """Calcula Inverse Document Frequency (IDF) suavizado sobre o corpus de vagas."""
    total_docs = max(len(doc_counters), 1)
    df: Counter = Counter()
    for c in doc_counters:
        for term in c.keys():
            df[term] += 1
    return {term: math.log((total_docs + 1) / (freq + 1)) + 1.0 for term, freq in df.items()}


def _tfidf_cosine_similarity(counter_a: Counter, counter_b: Counter, idf: dict[str, float]) -> float:
    if not counter_a or not counter_b:
        return 0.0
    common = set(counter_a.keys()) & set(counter_b.keys())
    if not common:
        return 0.0

    def weight(term: str, tf: int) -> float:
        return (1.0 + math.log(tf)) * idf.get(term, 1.0)

    dot = sum(weight(k, counter_a[k]) * weight(k, counter_b[k]) for k in common)
    norm_a = math.sqrt(sum(weight(k, v) ** 2 for k, v in counter_a.items()))
    norm_b = math.sqrt(sum(weight(k, v) ** 2 for k, v in counter_b.items()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _seniority_score(candidate_seniority: str, job_seniority: str) -> float:
    c_rank = SENIORITY_RANK.get(candidate_seniority, 3)
    j_rank = SENIORITY_RANK.get(job_seniority, 3)
    diff = abs(c_rank - j_rank)
    if diff == 0:
        return 1.0
    if diff == 1:
        return 0.72
    if diff == 2:
        return 0.40
    return 0.15


def parse_salary_value(salary_str: str) -> int:
    """Extrai o maior valor numérico de salário (suporta R$, USD/EUR com vírgula e sufixo k/K)."""
    if not salary_str:
        return 0
    values: list[int] = []
    # Captura formatos abreviados como $170k, $3.5k, 35,3k, 70K
    for m in re.findall(r"(\d+(?:[.,]\d+)?)\s*k\b", salary_str, flags=re.IGNORECASE):
        try:
            values.append(int(round(float(m.replace(",", ".")) * 1000)))
        except ValueError:
            pass
    # Captura números inteiros/milhares como 9.500, 13.000, 80,000, 120000
    for m in re.findall(r"(\d{1,3}(?:[.,]\d{3})+|\d{4,6})", salary_str):
        cleaned = m.replace(".", "").replace(",", "")
        if cleaned.isdigit():
            values.append(int(cleaned))
    return max(values) if values else 0


def _posted_sort_key(posted_at: str) -> tuple[int, str]:
    """Garante que datas ISO reais (YYYY-MM-DD) fiquem acima de rótulos genéricos ou vazios."""
    val = str(posted_at or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", val):
        return (1, val)
    return (0, "")


def _infer_custom_job_seniority(title: str, description: str, fallback: str) -> str:
    """Infere a senioridade real de uma vaga colada a partir do título e descrição."""
    combined = normalize_text(f"{title} {description[:300]}")
    if re.search(r"\b(staff|principal|tech\s+lead|lead|head|architect|arquiteto|especialista)\b", combined):
        return "Sênior / Liderança"
    if re.search(r"\b(senior|sr\.?)\b", combined):
        return "Sênior"
    if re.search(r"\b(estagio|estagiario|intern|trainee)\b", combined):
        return "Estágio / Trainee"
    if re.search(r"\b(junior|jr\.?)\b", combined):
        return "Júnior"
    if re.search(r"\b(pleno|mid[- ]?level)\b", combined):
        return "Pleno"
    return fallback


def _find_related_matches(candidate_skills: list[str], missing_skills: list[str]) -> list[str]:
    """Identifica skills faltantes que possuem forte proximidade semântica com as do candidato."""
    related_pool: set[str] = set()
    for skill in candidate_skills:
        related_pool.update(RELATED_SKILLS.get(skill, set()))
    return [ms for ms in missing_skills if ms in related_pool]


def _build_pitch(job: dict, matched_skills: list[str], candidate_seniority: str) -> str:
    """Gera uma sugestão curta de mensagem/pitch personalizada para a vaga."""
    skills_txt = ", ".join(matched_skills[:4]) if matched_skills else "minha experiência na área"
    return (
        f"Olá! Vi a oportunidade de {job.get('title', 'vaga')} na {job.get('company', 'empresa')} "
        f"e acredito ter ótima aderência ao perfil ({candidate_seniority}), especialmente pela minha "
        f"experiência prática com {skills_txt}. Fico à disposição para conversarmos sobre como posso contribuir com o time!"
    )


def compute_skill_gap_analytics(ranked_jobs: list[dict], top_n: int = 12) -> list[dict]:
    """Analisa as top vagas e retorna as habilidades mais pedidas que o candidato ainda não tem."""
    sample = ranked_jobs[:top_n]
    if not sample:
        return []
    counter: Counter = Counter()
    for job in sample:
        for skill in job.get("missing_skills", []):
            counter[skill] += 1

    total = len(sample)
    return [
        {
            "skill": skill,
            "demand_count": count,
            "demand_pct": int(round((count / total) * 100)),
        }
        for skill, count in counter.most_common(6)
    ]


def match_jobs(
    jobs: list[dict],
    candidate_skills: list[str],
    candidate_text: str = "",
    candidate_seniority: str = "Pleno",
    suggested_roles: list[str] | None = None,
    modality_filter: str = "",
    seniority_filter: str = "",
    search_query: str = "",
    min_score: int = 0,
    sort_by: str = "match",
) -> list[dict]:
    """Ranqueia vagas usando TF-IDF real, matching semântico de skills e score explicável."""
    suggested_roles = suggested_roles or []
    candidate_skill_map = {s.lower(): s for s in candidate_skills}
    candidate_tokens = Counter(_tokenize(f"{candidate_text} {' '.join(candidate_skills)} {' '.join(suggested_roles)}"))
    role_tokens = set(_tokenize(" ".join(suggested_roles)))

    norm_query = normalize_text(search_query) if search_query else ""
    norm_modality = normalize_text(modality_filter) if modality_filter else ""
    norm_seniority = normalize_text(seniority_filter) if seniority_filter else ""

    # Pré-computa tokens e IDF sobre todas as vagas para TF-IDF real
    job_token_counters: list[Counter] = [
        Counter(_tokenize(f"{j.get('title', '')} {' '.join(j.get('skills') or [])} {j.get('description', '')}"))
        for j in jobs
    ]
    idf = _compute_idf(job_token_counters + [candidate_tokens])

    results: list[dict] = []

    for job, job_tokens in zip(jobs, job_token_counters):
        # Filtros opcionais do usuário
        if norm_modality and norm_modality != "todas":
            job_mod = normalize_text(job.get("modality", ""))
            if norm_modality not in job_mod:
                continue

        if norm_seniority and norm_seniority != "todas":
            job_sen = normalize_text(job.get("seniority", ""))
            if norm_seniority not in job_sen:
                continue

        if norm_query:
            searchable = normalize_text(
                f"{job.get('title', '')} {job.get('company', '')} {job.get('location', '')} "
                f"{' '.join(job.get('skills', []))} {job.get('description', '')}"
            )
            if norm_query not in searchable:
                continue

        job_skills: list[str] = job.get("skills") or []
        job_skill_map = {s.lower(): s for s in job_skills}

        matched_keys = [k for k in job_skill_map if k in candidate_skill_map]
        missing_keys = [k for k in job_skill_map if k not in candidate_skill_map]

        matched_skills = [job_skill_map[k] for k in matched_keys]
        raw_missing_skills = [job_skill_map[k] for k in missing_keys]
        related_skills = _find_related_matches(candidate_skills, raw_missing_skills)
        missing_skills = [s for s in raw_missing_skills if s not in related_skills]

        # 1. Pontuação de skills com crédito parcial (45%) para skills semanticamente relacionadas
        if job_skills:
            effective_hits = len(matched_skills) + 0.45 * len(related_skills)
            coverage = min(effective_hits / len(job_skills), 1.0)
            breadth_bonus = min(effective_hits / 5.0, 1.0)
            skill_score = 0.72 * coverage + 0.28 * breadth_bonus
        else:
            skill_score = 0.25

        # 2. Similaridade textual TF-IDF (0 a 1)
        text_sim = min(_tfidf_cosine_similarity(candidate_tokens, job_tokens, idf) * 2.4, 1.0)

        # 3. Compatibilidade de senioridade (0 a 1)
        sen_score = _seniority_score(candidate_seniority, job.get("seniority", "Pleno"))

        # 4. Afinidade com cargo sugerido (0 a 1)
        title_tokens = set(_tokenize(job.get("title", "")))
        role_score = 1.0 if (role_tokens & title_tokens) else 0.35

        # Score final ponderado (0 a 100)
        weighted = (
            0.55 * skill_score
            + 0.22 * text_sim
            + 0.13 * sen_score
            + 0.10 * role_score
        )
        score_pct = int(round(min(max(weighted * 100, 5), 99)))

        if score_pct < min_score:
            continue

        # Explicação legível do match
        if matched_skills and related_skills:
            reason = (
                f"{len(matched_skills)} skill(s) exata(s) ({', '.join(matched_skills[:3])}) "
                f"+ {len(related_skills)} relacionada(s) ({', '.join(related_skills[:2])})"
            )
        elif matched_skills:
            reason = f"{len(matched_skills)} de {max(len(job_skills), len(matched_skills))} habilidades compatíveis ({', '.join(matched_skills[:4])})"
        elif related_skills:
            reason = f"Afinidade por ecossistema relacionado ({', '.join(related_skills[:3])})"
        else:
            reason = "Compatibilidade baseada no contexto geral do currículo e área de atuação"

        enriched = dict(job)
        enriched["match_score"] = score_pct
        enriched["score_breakdown"] = {
            "skills": int(round(skill_score * 100)),
            "semantic": int(round(text_sim * 100)),
            "seniority": int(round(sen_score * 100)),
            "role": int(round(role_score * 100)),
        }
        enriched["matched_skills"] = matched_skills
        enriched["related_skills"] = related_skills[:4]
        enriched["missing_skills"] = missing_skills[:6]
        enriched["match_reason"] = reason
        enriched["salary_numeric"] = parse_salary_value(job.get("salary", ""))
        enriched["pitch_suggestion"] = _build_pitch(job, matched_skills, candidate_seniority)
        results.append(enriched)

    if sort_by == "salary":
        results.sort(key=lambda j: (j["salary_numeric"], j["match_score"]), reverse=True)
    elif sort_by == "recent":
        results.sort(key=lambda j: (_posted_sort_key(j.get("posted_at", "")), j["match_score"]), reverse=True)
    else:
        results.sort(key=lambda j: (j["match_score"], len(j["matched_skills"])), reverse=True)

    return results


def compare_custom_job_description(
    job_description: str,
    job_title: str,
    candidate_skills: list[str],
    candidate_text: str,
    candidate_seniority: str,
    suggested_roles: list[str] | None = None,
) -> dict:
    """Compara o currículo do usuário diretamente com uma vaga colada manualmente."""
    extracted_skills = extract_skills(f"{job_title} {job_description}")
    inferred_seniority = _infer_custom_job_seniority(job_title, job_description, candidate_seniority)
    synthetic_job = {
        "id": "custom-job",
        "title": job_title or "Vaga Personalizada",
        "company": "Vaga Colada",
        "location": "Conforme descrição",
        "modality": "Não informada",
        "seniority": inferred_seniority,
        "salary": "A combinar",
        "skills": extracted_skills,
        "description": job_description,
        "url": "#",
        "source": "Comparação Direta",
        "posted_at": "Hoje",
    }
    matched = match_jobs(
        jobs=[synthetic_job],
        candidate_skills=candidate_skills,
        candidate_text=candidate_text,
        candidate_seniority=candidate_seniority,
        suggested_roles=suggested_roles,
    )[0]

    tips: list[str] = []
    if matched["missing_skills"]:
        tips.append(
            f"Se você possui experiência com {', '.join(matched['missing_skills'][:4])}, mencione explicitamente no currículo com exemplos práticos."
        )
    if matched["related_skills"]:
        tips.append(
            f"Você já tem base próxima em {', '.join(matched['related_skills'][:3])} — destaque sua facilidade de transição."
        )
    if matched["match_score"] >= 75:
        tips.append("Excelente aderência! Personalize o resumo do currículo usando o título desta vaga e candidate-se.")
    else:
        tips.append("Adapte os tópicos da sua última experiência usando as palavras-chave principais da descrição.")

    matched["optimization_tips"] = tips
    return matched
