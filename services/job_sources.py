from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus

import requests

from services.resume_parser import extract_skills, normalize_text

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LOCAL_JOBS_PATH = DATA_DIR / "local_jobs.json"

_CACHE: dict[str, tuple[float, list[dict]]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutos


def _strip_html(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    return re.sub(r"\s+", " ", text).strip()


def load_local_jobs() -> list[dict]:
    """Carrega o catálogo local curado de vagas no Brasil."""
    if not LOCAL_JOBS_PATH.exists():
        return []
    with LOCAL_JOBS_PATH.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _fetch_remotive_request(search_term: str, limit: int) -> list[dict]:
    params: dict[str, str | int] = {"limit": limit}
    if search_term:
        params["search"] = search_term
    resp = requests.get("https://remotive.com/api/remote-jobs", params=params, timeout=4)
    resp.raise_for_status()
    return resp.json().get("jobs", [])[:limit]


def fetch_remotive_jobs(search_term: str = "", limit: int = 25) -> list[dict]:
    """Busca vagas remotas reais na API pública da Remotive, com fallback automático."""
    safe_term = re.sub(r"[^a-zA-Z0-9\s.+]", "", search_term or "").strip()
    cache_key = f"remotive:{safe_term.lower()}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        raw_items = _fetch_remotive_request(safe_term, limit)
        if not raw_items and safe_term:
            raw_items = _fetch_remotive_request("", limit)
    except Exception:
        return []

    jobs: list[dict] = []
    for item in raw_items:
        desc = _strip_html(item.get("description", ""))
        tags = item.get("tags") or []
        combined_text = f"{item.get('title', '')} {' '.join(tags)} {desc}"
        skills = extract_skills(combined_text)
        jobs.append(
            {
                "id": f"remotive-{item.get('id')}",
                "title": item.get("title", "Vaga Remota"),
                "company": item.get("company_name", "Empresa Internacional"),
                "location": item.get("candidate_required_location") or "Remoto Global",
                "modality": "Remoto",
                "seniority": _infer_job_seniority(item.get("title", "")),
                "salary": item.get("salary") or "A combinar",
                "skills": skills,
                "description": desc[:950] + ("..." if len(desc) > 950 else ""),
                "url": item.get("url", "https://remotive.com"),
                "source": "Remotive (Ao Vivo)",
                "posted_at": (item.get("publication_date") or "")[:10],
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


def fetch_arbeitnow_jobs(limit: int = 25) -> list[dict]:
    """Busca vagas reais na API pública da Arbeitnow."""
    cache_key = "arbeitnow:latest"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        resp = requests.get("https://www.arbeitnow.com/api/job-board-api", timeout=4)
        resp.raise_for_status()
        payload = resp.json()
    except Exception:
        return []

    jobs: list[dict] = []
    for idx, item in enumerate(payload.get("data", [])[:limit]):
        desc = _strip_html(item.get("description", ""))
        tags = item.get("tags") or []
        combined_text = f"{item.get('title', '')} {' '.join(tags)} {desc}"
        skills = extract_skills(combined_text)
        is_remote = bool(item.get("remote"))
        created_at = item.get("created_at")
        posted_at = ""
        if isinstance(created_at, (int, float)) and created_at > 0:
            posted_at = datetime.fromtimestamp(created_at, tz=timezone.utc).strftime("%Y-%m-%d")
        jobs.append(
            {
                "id": f"arbeitnow-{item.get('slug', idx)}",
                "title": item.get("title", "Tech Job"),
                "company": item.get("company_name", "Empresa"),
                "location": item.get("location") or ("Remoto" if is_remote else "Internacional"),
                "modality": "Remoto" if is_remote else "Presencial",
                "seniority": _infer_job_seniority(item.get("title", "")),
                "salary": "A combinar",
                "skills": skills,
                "description": desc[:950] + ("..." if len(desc) > 950 else ""),
                "url": item.get("url", "https://www.arbeitnow.com"),
                "source": "Arbeitnow (Ao Vivo)",
                "posted_at": posted_at,
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


def _infer_job_seniority(title: str) -> str:
    lower = title.lower()
    if any(k in lower for k in ["staff", "principal", "lead", "head", "architect", "especialista"]):
        return "Sênior / Liderança"
    if any(k in lower for k in ["senior", "sênior", "sr.", "sr "]):
        return "Sênior"
    if any(k in lower for k in ["junior", "júnior", "jr.", "jr "]):
        return "Júnior"
    if any(k in lower for k in ["intern", "estágio", "estagio", "trainee"]):
        return "Estágio / Trainee"
    return "Pleno"


def _deduplicate_jobs(jobs: list[dict]) -> list[dict]:
    """Remove vagas duplicadas comparando título e empresa normalizados."""
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for job in jobs:
        key = (normalize_text(job.get("title", "")), normalize_text(job.get("company", "")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(job)
    return unique


def collect_jobs(
    source_filter: str = "all",
    primary_skill: str = "",
    include_live: bool = True,
) -> tuple[list[dict], dict]:
    """Agrega vagas locais (Brasil) e APIs externas em paralelo conforme o filtro."""
    jobs: list[dict] = []
    sources_status = {"local_br": 0, "remotive": 0, "arbeitnow": 0}

    if source_filter in ("all", "local"):
        local_jobs = load_local_jobs()
        jobs.extend(local_jobs)
        sources_status["local_br"] = len(local_jobs)

    should_fetch_live = (source_filter == "live") or (include_live and source_filter == "all")
    if should_fetch_live:
        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_remotive = executor.submit(fetch_remotive_jobs, primary_skill, 20)
            fut_arbeitnow = executor.submit(fetch_arbeitnow_jobs, 20)
            remotive = fut_remotive.result()
            arbeitnow = fut_arbeitnow.result()

        jobs.extend(remotive)
        jobs.extend(arbeitnow)
        sources_status["remotive"] = len(remotive)
        sources_status["arbeitnow"] = len(arbeitnow)

    return _deduplicate_jobs(jobs), sources_status


def build_external_search_links(skills: list[str], suggested_roles: list[str]) -> list[dict]:
    """Gera links prontos de busca nos principais portais de vagas do Brasil."""
    top_role = suggested_roles[0] if suggested_roles else ""
    top_skills = " ".join(skills[:3])
    query = (top_skills or top_role or "tecnologia").strip()
    encoded = quote_plus(query)

    return [
        {
            "portal": "LinkedIn",
            "query": query,
            "url": f"https://www.linkedin.com/jobs/search/?keywords={encoded}&location=Brasil",
        },
        {
            "portal": "Gupy",
            "query": query,
            "url": f"https://portal.gupy.io/job-search/term={encoded}",
        },
        {
            "portal": "Indeed Brasil",
            "query": query,
            "url": f"https://br.indeed.com/jobs?q={encoded}&l=Brasil",
        },
        {
            "portal": "InfoJobs",
            "query": query,
            "url": f"https://www.infojobs.com.br/empregos.aspx?palabra={encoded}",
        },
    ]
