from __future__ import annotations

import email.utils
import json
import re
import time
import xml.etree.ElementTree as ET
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
REQUEST_HEADERS = {"User-Agent": "VagaMatchPDF/2.0 (Job Search Aggregator)"}


def _strip_html(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#\d+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


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


def _build_deep_search_terms(skills: list[str] | None, suggested_roles: list[str] | None, primary_skill: str) -> list[str]:
    """Gera múltiplos termos de busca para varredura profunda em APIs externas."""
    terms: list[str] = []
    skill_map = {
        "Segurança da Informação": "security",
        "Threat Hunting / YARA": "cybersecurity",
        "LLM / IA Generativa": "ai",
        "Machine Learning": "machine learning",
        "QA / Testes": "qa",
        "Scrum / Ágil": "agile",
    }
    for s in (skills or []):
        mapped = skill_map.get(s, s)
        cleaned = re.sub(r"[^a-zA-Z0-9\s.+]", "", mapped).strip()
        if cleaned and cleaned.lower() not in [t.lower() for t in terms]:
            terms.append(cleaned)
        if len(terms) >= 4:
            break

    role_keywords = {
        "Cibersegurança": "cybersecurity",
        "Cientista de Dados": "data science",
        "Engenheiro de Dados": "data engineer",
        "DevOps": "devops",
        "Full Stack": "full stack",
        "Backend": "backend",
        "Frontend": "frontend",
        "Mobile": "mobile",
    }
    for role in (suggested_roles or []):
        for k, term in role_keywords.items():
            if k.lower() in role.lower() and term not in [t.lower() for t in terms]:
                terms.append(term)
                break

    if not terms and primary_skill:
        safe = re.sub(r"[^a-zA-Z0-9\s.+]", "", primary_skill).strip()
        if safe:
            terms.append(safe)

    return terms[:4] or [""]


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
    resp = requests.get("https://remotive.com/api/remote-jobs", params=params, headers=REQUEST_HEADERS, timeout=6)
    resp.raise_for_status()
    return resp.json().get("jobs", [])[:limit]


def fetch_remotive_jobs(search_term: str = "", limit: int = 25) -> list[dict]:
    """Busca vagas remotas reais na API pública da Remotive, com fallback automático."""
    safe_term = re.sub(r"[^a-zA-Z0-9\s.+]", "", search_term or "").strip()
    cache_key = f"remotive:{safe_term.lower()}:{limit}"
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


def fetch_arbeitnow_jobs(limit: int = 30) -> list[dict]:
    """Busca vagas reais na API pública da Arbeitnow."""
    cache_key = f"arbeitnow:latest:{limit}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        resp = requests.get("https://www.arbeitnow.com/api/job-board-api", headers=REQUEST_HEADERS, timeout=6)
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


def fetch_jobicy_jobs(tag: str = "", limit: int = 20) -> list[dict]:
    """Busca vagas remotas reais na API pública da Jobicy."""
    safe_tag = re.sub(r"[^a-zA-Z0-9\s-]", "", tag or "").strip().lower()
    cache_key = f"jobicy:{safe_tag}:{limit}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        params: dict[str, str | int] = {"count": min(limit, 50)}
        if safe_tag:
            params["tag"] = safe_tag
        resp = requests.get("https://jobicy.com/api/v2/remote-jobs", params=params, headers=REQUEST_HEADERS, timeout=6)
        resp.raise_for_status()
        raw_items = resp.json().get("jobs", [])[:limit]
        if not raw_items and safe_tag:
            resp2 = requests.get("https://jobicy.com/api/v2/remote-jobs", params={"count": min(limit, 25)}, headers=REQUEST_HEADERS, timeout=6)
            resp2.raise_for_status()
            raw_items = resp2.json().get("jobs", [])[:limit]
    except Exception:
        return []

    jobs: list[dict] = []
    for item in raw_items:
        desc = _strip_html(item.get("jobDescription") or item.get("jobExcerpt") or "")
        industries = item.get("jobIndustry") or []
        title = _strip_html(item.get("jobTitle") or "Vaga Remota")
        combined = f"{title} {' '.join(industries)} {desc}"
        level = str(item.get("jobLevel") or "")
        jobs.append(
            {
                "id": f"jobicy-{item.get('id')}",
                "title": title,
                "company": _strip_html(item.get("companyName") or "Empresa"),
                "location": _strip_html(item.get("jobGeo") or "Remoto Global"),
                "modality": "Remoto",
                "seniority": _infer_job_seniority(f"{title} {level}"),
                "salary": "A combinar",
                "skills": extract_skills(combined),
                "description": desc[:950] + ("..." if len(desc) > 950 else ""),
                "url": item.get("url", "https://jobicy.com"),
                "source": "Jobicy (Ao Vivo)",
                "posted_at": str(item.get("pubDate") or "")[:10],
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


def fetch_remoteok_jobs(limit: int = 35) -> list[dict]:
    """Busca vagas tech remotas reais na API pública da RemoteOK."""
    cache_key = f"remoteok:latest:{limit}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        resp = requests.get("https://remoteok.com/api", headers=REQUEST_HEADERS, timeout=6)
        resp.raise_for_status()
        raw = resp.json()
        raw_items = [x for x in raw if isinstance(x, dict) and x.get("position")][:limit]
    except Exception:
        return []

    jobs: list[dict] = []
    for item in raw_items:
        desc = _strip_html(item.get("description", ""))
        tags = item.get("tags") or []
        title = str(item.get("position") or "Remote Tech Job").strip()
        combined = f"{title} {' '.join(str(t) for t in tags)} {desc}"
        s_min = item.get("salary_min") or 0
        s_max = item.get("salary_max") or 0
        if s_min and s_max:
            salary = f"USD {int(s_min):,} - {int(s_max):,}"
        elif s_max:
            salary = f"USD {int(s_max):,}"
        else:
            salary = "A combinar"
        jobs.append(
            {
                "id": f"remoteok-{item.get('id')}",
                "title": title,
                "company": str(item.get("company") or "Empresa Internacional"),
                "location": str(item.get("location") or "Remoto Global"),
                "modality": "Remoto",
                "seniority": _infer_job_seniority(title),
                "salary": salary,
                "skills": extract_skills(combined),
                "description": desc[:950] + ("..." if len(desc) > 950 else ""),
                "url": item.get("apply_url") or item.get("url") or "https://remoteok.com",
                "source": "RemoteOK (Ao Vivo)",
                "posted_at": str(item.get("date") or "")[:10],
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


def fetch_himalayas_jobs(limit: int = 30) -> list[dict]:
    """Busca vagas remotas reais na API pública da Himalayas."""
    cache_key = f"himalayas:latest:{limit}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        resp = requests.get("https://himalayas.app/jobs/api", params={"limit": limit}, headers=REQUEST_HEADERS, timeout=6)
        resp.raise_for_status()
        raw_items = resp.json().get("jobs", [])[:limit]
    except Exception:
        return []

    jobs: list[dict] = []
    for idx, item in enumerate(raw_items):
        desc = _strip_html(item.get("description") or item.get("excerpt") or "")
        cats = item.get("categories") or []
        title = str(item.get("title") or "Remote Job").strip()
        combined = f"{title} {' '.join(str(c) for c in cats)} {desc}"
        locs = item.get("locationRestrictions") or []
        location = ", ".join(str(x) for x in locs[:3]) if locs else "Remoto Global"
        min_s = item.get("minSalary")
        max_s = item.get("maxSalary")
        curr = item.get("currency") or "USD"
        if min_s and max_s:
            salary = f"{curr} {int(min_s):,} - {int(max_s):,}"
        elif max_s:
            salary = f"{curr} {int(max_s):,}"
        else:
            salary = "A combinar"
        pub = item.get("pubDate")
        posted_at = ""
        if isinstance(pub, (int, float)) and pub > 0:
            try:
                posted_at = datetime.fromtimestamp(pub, tz=timezone.utc).strftime("%Y-%m-%d")
            except (OverflowError, OSError, ValueError):
                posted_at = ""
        sen_list = item.get("seniority") or []
        sen_hint = f"{title} {' '.join(str(s) for s in sen_list)}"
        jobs.append(
            {
                "id": f"himalayas-{idx}-{abs(hash(item.get('guid', title))) % 1000000}",
                "title": title,
                "company": str(item.get("companyName") or "Empresa"),
                "location": location,
                "modality": "Remoto",
                "seniority": _infer_job_seniority(sen_hint),
                "salary": salary,
                "skills": extract_skills(combined),
                "description": desc[:950] + ("..." if len(desc) > 950 else ""),
                "url": item.get("applicationLink") or item.get("guid") or "https://himalayas.app",
                "source": "Himalayas (Ao Vivo)",
                "posted_at": posted_at,
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


def fetch_weworkremotely_jobs(limit: int = 30) -> list[dict]:
    """Busca vagas remotas reais do feed RSS oficial da We Work Remotely."""
    cache_key = f"wwr:latest:{limit}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        resp = requests.get("https://weworkremotely.com/remote-jobs.rss", headers=REQUEST_HEADERS, timeout=6)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        items = root.findall(".//item")[:limit]
    except Exception:
        return []

    jobs: list[dict] = []
    for idx, elem in enumerate(items):
        raw_title = (elem.findtext("title") or "Remote Job").strip()
        if ":" in raw_title:
            company, title = [p.strip() for p in raw_title.split(":", 1)]
        else:
            company, title = "We Work Remotely", raw_title
        desc = _strip_html(elem.findtext("description") or "")
        region = (elem.findtext("region") or "Remoto Global").strip()
        category = (elem.findtext("category") or "").strip()
        pub_raw = (elem.findtext("pubDate") or "").strip()
        posted_at = ""
        if pub_raw:
            try:
                dt = email.utils.parsedate_to_datetime(pub_raw)
                posted_at = dt.strftime("%Y-%m-%d")
            except Exception:
                posted_at = ""
        combined = f"{title} {category} {desc}"
        jobs.append(
            {
                "id": f"wwr-{idx}-{abs(hash(elem.findtext('guid') or raw_title)) % 1000000}",
                "title": title,
                "company": company,
                "location": region or "Remoto Global",
                "modality": "Remoto",
                "seniority": _infer_job_seniority(title),
                "salary": "A combinar",
                "skills": extract_skills(combined),
                "description": desc[:950] + ("..." if len(desc) > 950 else ""),
                "url": (elem.findtext("link") or "https://weworkremotely.com").strip(),
                "source": "We Work Remotely (Ao Vivo)",
                "posted_at": posted_at,
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


def fetch_github_br_jobs(repo: str = "backend-br/vagas", limit: int = 20) -> list[dict]:
    """Busca vagas reais brasileiras abertas em repositórios públicos do GitHub."""
    cache_key = f"github:{repo}:{limit}"
    now = time.time()
    if cache_key in _CACHE and (now - _CACHE[cache_key][0]) < CACHE_TTL_SECONDS:
        return _CACHE[cache_key][1]

    try:
        resp = requests.get(
            f"https://api.github.com/repos/{repo}/issues",
            params={"state": "open", "per_page": limit},
            headers={**REQUEST_HEADERS, "Accept": "application/vnd.github+json"},
            timeout=6,
        )
        resp.raise_for_status()
        issues = resp.json()
        if not isinstance(issues, list):
            return []
    except Exception:
        return []

    jobs: list[dict] = []
    for item in issues:
        if "pull_request" in item:
            continue
        raw_title = str(item.get("title") or "").strip()
        body = _strip_html(str(item.get("body") or ""))
        labels = [str(l.get("name", "")) for l in (item.get("labels") or []) if isinstance(l, dict)]
        labels_norm = normalize_text(" ".join(labels) + " " + raw_title)

        # Extrai empresa do padrão comum "[Remoto] Cargo na Empresa" ou "@ Empresa"
        company = f"Comunidade {repo.split('/')[0]}"
        comp_match = re.search(r"(?:\bna\b|\bno\b|@)\s+([^|\-\[\]]{2,45})$", raw_title, flags=re.IGNORECASE)
        if comp_match:
            company = comp_match.group(1).strip()

        if "remoto" in labels_norm or "remote" in labels_norm or "home office" in labels_norm:
            modality = "Remoto"
        elif "hibrido" in labels_norm:
            modality = "Híbrido"
        else:
            modality = "Presencial"

        loc_match = re.search(r"\[([^\]]{2,35})\]", raw_title)
        location = loc_match.group(1).strip() if loc_match else ("Remoto (Brasil)" if modality == "Remoto" else "Brasil")

        combined = f"{raw_title} {' '.join(labels)} {body}"
        jobs.append(
            {
                "id": f"gh-{repo.replace('/', '-')}-{item.get('id')}",
                "title": raw_title,
                "company": company,
                "location": location,
                "modality": modality,
                "seniority": _infer_job_seniority(f"{raw_title} {' '.join(labels)}"),
                "salary": "A combinar",
                "skills": extract_skills(combined),
                "description": body[:950] + ("..." if len(body) > 950 else ""),
                "url": item.get("html_url", f"https://github.com/{repo}/issues"),
                "source": f"GitHub BR ({repo.split('/')[0]})",
                "posted_at": str(item.get("created_at") or "")[:10],
            }
        )

    _CACHE[cache_key] = (now, jobs)
    return jobs


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
    deep_search: bool = False,
    skills: list[str] | None = None,
    suggested_roles: list[str] | None = None,
) -> tuple[list[dict], dict]:
    """Agrega vagas locais (Brasil) e múltiplas APIs reais da internet em paralelo."""
    jobs: list[dict] = []
    sources_status = {
        "local_br": 0,
        "remotive": 0,
        "arbeitnow": 0,
        "jobicy": 0,
        "remoteok": 0,
        "himalayas": 0,
        "weworkremotely": 0,
        "github_br": 0,
        "deep_search": deep_search,
    }

    if source_filter in ("all", "local"):
        local_jobs = load_local_jobs()
        jobs.extend(local_jobs)
        sources_status["local_br"] = len(local_jobs)

    should_fetch_live = (source_filter == "live") or (include_live and source_filter == "all")
    if should_fetch_live:
        search_terms = _build_deep_search_terms(skills, suggested_roles, primary_skill) if deep_search else [primary_skill]

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures: list[tuple[str, object]] = []

            # Remotive (multi-query na busca profunda)
            for term in search_terms[: (3 if deep_search else 1)]:
                futures.append(("remotive", executor.submit(fetch_remotive_jobs, term, 25 if deep_search else 20)))

            # Jobicy (multi-query na busca profunda)
            for term in search_terms[: (2 if deep_search else 1)]:
                futures.append(("jobicy", executor.submit(fetch_jobicy_jobs, term, 20)))

            # Arbeitnow
            futures.append(("arbeitnow", executor.submit(fetch_arbeitnow_jobs, 35 if deep_search else 20)))

            # GitHub Vagas Brasil (vagas reais brasileiras!)
            futures.append(("github_br", executor.submit(fetch_github_br_jobs, "backend-br/vagas", 25 if deep_search else 15)))
            if deep_search:
                futures.append(("github_br", executor.submit(fetch_github_br_jobs, "qa-brasil/vagas", 15)))
                futures.append(("remoteok", executor.submit(fetch_remoteok_jobs, 35)))
                futures.append(("himalayas", executor.submit(fetch_himalayas_jobs, 30)))
                futures.append(("weworkremotely", executor.submit(fetch_weworkremotely_jobs, 30)))

            for source_key, fut in futures:
                try:
                    batch = fut.result()
                except Exception:
                    batch = []
                jobs.extend(batch)
                sources_status[source_key] = sources_status.get(source_key, 0) + len(batch)

    return _deduplicate_jobs(jobs), sources_status


def build_external_search_links(skills: list[str], suggested_roles: list[str]) -> list[dict]:
    """Gera links prontos de busca profunda nos principais portais de vagas da internet."""
    top_role = suggested_roles[0] if suggested_roles else ""
    secondary_role = suggested_roles[1] if len(suggested_roles) > 1 else ""
    top_skills = " ".join(skills[:3])
    query = (top_skills or top_role or "tecnologia").strip()
    role_query = (secondary_role or top_role or query).split("/")[0].strip()
    deep_dork = f'("{role_query}" OR "{top_skills}") ("vaga" OR "remote" OR "remoto") Brasil'

    encoded = quote_plus(query)
    encoded_role = quote_plus(role_query)
    encoded_dork = quote_plus(deep_dork)

    return [
        {
            "portal": "Google Jobs (Busca Profunda)",
            "query": deep_dork,
            "url": f"https://www.google.com/search?q={encoded_dork}&ibp=htl;jobs",
        },
        {
            "portal": "LinkedIn (Skills)",
            "query": query,
            "url": f"https://www.linkedin.com/jobs/search/?keywords={encoded}&location=Brasil",
        },
        {
            "portal": "LinkedIn (Cargo)",
            "query": role_query,
            "url": f"https://www.linkedin.com/jobs/search/?keywords={encoded_role}&location=Brasil",
        },
        {
            "portal": "Gupy",
            "query": role_query,
            "url": f"https://portal.gupy.io/job-search/term={encoded_role}",
        },
        {
            "portal": "Indeed Brasil",
            "query": query,
            "url": f"https://br.indeed.com/jobs?q={encoded}&l=Brasil",
        },
        {
            "portal": "Glassdoor Brasil",
            "query": role_query,
            "url": f"https://www.glassdoor.com.br/Vaga/brasil-{quote_plus(role_query.lower().replace(' ', '-'))}-vagas-SRCH_IL.0,6_IN36.htm",
        },
        {
            "portal": "Programathor",
            "query": query,
            "url": f"https://programathor.com.br/jobs?search={encoded}",
        },
        {
            "portal": "InfoJobs",
            "query": role_query,
            "url": f"https://www.infojobs.com.br/empregos.aspx?palabra={encoded_role}",
        },
    ]
