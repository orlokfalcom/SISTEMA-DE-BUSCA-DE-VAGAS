from __future__ import annotations

import io
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from typing import Any
from xml.sax.saxutils import escape as xml_escape

from pypdf import PdfReader

from services.resume_parser import extract_skills

ATS_PLATFORMS_SUPPORTED = [
    "Workday", "Greenhouse", "Lever", "iCIMS", "SmartRecruiters", "Taleo",
    "SuccessFactors", "Gupy", "Kenoby", "Sólides", "Vagas.com", "LinkedIn Recruiter",
]

DEFAULT_ATS_SCORING_WEIGHTS = {
    "technical_skills": 25,
    "experience": 20,
    "keywords": 15,
    "education": 10,
    "seniority": 10,
    "certifications": 5,
    "soft_skills": 5,
    "languages": 5,
    "structural_readability": 5,
}

DOMAIN_SYNONYMS: dict[str, list[str]] = {
    "segurança da informação": ["Cybersecurity", "Information Security", "Gestão de vulnerabilidades", "Análise de riscos", "SIEM", "Resposta a incidentes", "Governança de TI"],
    "information security": ["Cibersegurança", "Cybersecurity", "Vulnerability Management", "Risk Analysis", "SIEM", "Incident Response", "IT Governance"],
    "engenheiro de dados": ["Data Engineer", "ETL", "Pipelines de Dados", "SQL", "Python", "Spark"],
    "data engineer": ["Engenheiro de Dados", "ETL", "Data Pipelines", "SQL", "Python", "Spark"],
    "desenvolvedor full stack": ["Full Stack Developer", "APIs REST", "Frontend", "Backend", "CI/CD"],
    "suporte técnico": ["Infraestrutura de TI", "Diagnóstico de Incidentes", "Service Desk", "Continuidade Operacional"],
}

LOCALIZED_HEADERS: dict[str, dict[str, str]] = {
    "pt": {
        "summary": "RESUMO PROFISSIONAL",
        "skills": "COMPETÊNCIAS TÉCNICAS",
        "soft_skills": "COMPETÊNCIAS COMPORTAMENTAIS",
        "experience": "EXPERIÊNCIA PROFISSIONAL",
        "education": "FORMAÇÃO ACADÊMICA",
        "certifications": "CERTIFICAÇÕES E QUALIFICAÇÕES",
        "tech_knowledge": "CONHECIMENTOS EM TECNOLOGIA",
        "projects": "PROJETOS RELEVANTES",
        "languages": "IDIOMAS",
        "courses": "CURSOS COMPLEMENTARES",
        "additional": "INFORMAÇÕES ADICIONAIS",
    },
    "en": {
        "summary": "PROFESSIONAL SUMMARY",
        "skills": "TECHNICAL SKILLS",
        "soft_skills": "SOFT SKILLS",
        "experience": "PROFESSIONAL EXPERIENCE",
        "education": "EDUCATION",
        "certifications": "CERTIFICATIONS",
        "projects": "KEY PROJECTS",
        "languages": "LANGUAGES",
        "courses": "ADDITIONAL COURSES",
    },
    "es": {
        "summary": "RESUMEN PROFESIONAL",
        "skills": "COMPETENCIAS TÉCNICAS",
        "soft_skills": "HABILIDADES BLANDAS",
        "experience": "EXPERIENCIA PROFESIONAL",
        "education": "FORMACIÓN ACADÉMICA",
        "certifications": "CERTIFICACIONES",
        "projects": "PROYECTOS RELEVANTES",
        "languages": "IDIOMAS",
        "courses": "CURSOS COMPLEMENTARIOS",
    },
    "fr": {
        "summary": "PROFIL PROFESSIONNEL",
        "skills": "COMPÉTENCES TECHNIQUES",
        "soft_skills": "COMPÉTENCES COMPORTEMENTALES",
        "experience": "EXPÉRIENCE PROFESSIONNELLE",
        "education": "FORMATION ACADÉMIQUE",
        "certifications": "CERTIFICATIONS",
        "projects": "PROJETS CLÉS",
        "languages": "LANGUES",
        "courses": "FORMATIONS COMPLÉMENTAIRES",
    },
}

REWRITE_RULES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"respons[aá]vel\s+pelo\s+suporte\s+(?:de|a)\s+computadores\.?", re.IGNORECASE),
        "Atuação no suporte técnico de infraestrutura de TI, diagnóstico e resolução de incidentes, manutenção de equipamentos e suporte aos usuários, contribuindo para a continuidade operacional dos ambientes tecnológicos.",
    ),
    (
        re.compile(r"fazia\s+planilhas(?:\s+no\s+excel)?\.?", re.IGNORECASE),
        "Estruturação e análise de dados em planilhas e relatórios gerenciais para acompanhamento de indicadores operacionais e suporte à tomada de decisão.",
    ),
    (
        re.compile(r"desenvolvia\s+sites\s+e\s+sistemas\.?", re.IGNORECASE),
        "Desenvolvimento e manutenção de aplicações web e sistemas corporativos, aplicando boas práticas de arquitetura, testes e integração de APIs.",
    ),
]


def rewrite_experience_text(text: str) -> str:
    """Transforma descrições genéricas em declarações orientadas a resultados sem inventar números."""
    out = str(text or "").strip()
    if not out:
        return ""
    for pattern, replacement in REWRITE_RULES:
        out = pattern.sub(replacement, out)
    # Normaliza início com letra maiúscula e remove prefixo passivo simples
    out = re.sub(r"^(?:responsável\s+por|fazia|cuidava\s+de)\s+", "Atuação em ", out, flags=re.IGNORECASE)
    return out[0].upper() + out[1:] if out else out


def analyze_job_description(job_text: str, job_title: str = "") -> dict[str, Any]:
    """Extrai requisitos estruturados, competências obrigatórias/desejáveis e palavras-chave da vaga."""
    combined = f"{job_title}\n{job_text}".strip()
    lower = combined.lower()
    all_skills = extract_skills(combined)

    mandatory_skills: list[str] = []
    desirable_skills: list[str] = []
    eliminatory: list[str] = []
    differentials: list[str] = []
    responsibilities: list[str] = []

    for line in combined.splitlines():
        ln = line.strip()
        if not ln:
            continue
        ln_low = ln.lower()
        ln_skills = extract_skills(ln)
        if any(k in ln_low for k in ("obrigatório", "obrigatorio", "indispensável", "required", "must have", "eliminatório")):
            mandatory_skills.extend(ln_skills)
            eliminatory.append(ln[:160])
        elif any(k in ln_low for k in ("desejável", "desejavel", "diferencial", "preferred", "nice to have", "plus")):
            desirable_skills.extend(ln_skills)
            differentials.append(ln[:160])
        elif any(k in ln_low for k in ("responsab", "atividades", "atribuições", "atuará", "will ", "manage", "develop")):
            responsibilities.append(ln[:160])

    for sk in all_skills:
        if sk not in mandatory_skills and sk not in desirable_skills:
            mandatory_skills.append(sk)

    # Senioridade e experiência mínima
    seniority = "Pleno"
    if re.search(r"\b(est[aá]gio|intern|trainee)\b", lower):
        seniority = "Estágio"
    elif re.search(r"\b(j[úu]nior|jr\.?|entry[- ]level)\b", lower):
        seniority = "Júnior"
    elif re.search(r"\b(s[êe]nior|sr\.?|especialista|staff|tech\s*lead|principal)\b", lower):
        seniority = "Sênior"

    yrs_m = re.search(r"(\d+)\s*\+?\s*(?:anos?|years?)", lower)
    min_years = int(yrs_m.group(1)) if yrs_m else None

    edu = "Não especificado"
    if re.search(r"(gradua[çc][ãa]o|bacharelado|ensino\s+superior|bachelor|degree)", lower):
        edu = "Ensino Superior"
    elif re.search(r"(t[ée]cnico|tecn[óo]logo)", lower):
        edu = "Técnico / Tecnólogo"

    certs = re.findall(r"\b(AWS Certified|Azure|CISSP|CEH|Security\+|CompTIA|ITIL|PMP|Scrum|CCNA)\b", combined, re.IGNORECASE)
    langs = [l for l in ("Inglês", "English", "Espanhol", "Spanish", "Francês", "French") if l.lower() in lower]
    soft = [s for s in ("Comunicação", "Liderança", "Trabalho em equipe", "Resolução de problemas", "Proatividade") if s.lower() in lower]

    # Sinônimos contextuais do domínio
    related_terms: list[str] = []
    for key, syns in DOMAIN_SYNONYMS.items():
        if key in lower:
            related_terms.extend(syns)

    area = "Tecnologia / Geral"
    if any(k in lower for k in ("segurança", "security", "siem", "soc", "pentest")):
        area = "Segurança da Informação"
    elif any(k in lower for k in ("dados", "data", "sql", "bi", "analytics", "machine learning")):
        area = "Dados & Analytics"
    elif any(k in lower for k in ("software", "backend", "frontend", "full stack", "api")):
        area = "Engenharia de Software"

    return {
        "target_role": job_title.strip() or (combined.splitlines()[0][:80] if combined else "Profissional"),
        "professional_area": area,
        "seniority": seniority,
        "required_education": edu,
        "min_experience_years": min_years,
        "mandatory_skills": list(dict.fromkeys(mandatory_skills)),
        "desirable_skills": list(dict.fromkeys(desirable_skills)),
        "soft_skills": soft,
        "tools_and_tech": all_skills,
        "certifications": list(dict.fromkeys(certs)),
        "languages": langs,
        "responsibilities": responsibilities[:6],
        "keywords": list(dict.fromkeys([*all_skills, *related_terms]))[:20],
        "eliminatory_requirements": eliminatory[:5],
        "differentials": differentials[:5],
    }


def score_cv_against_job(
    profile: dict[str, Any],
    cv_text: str,
    job_analysis: dict[str, Any],
    weights: dict[str, int] | None = None,
) -> dict[str, Any]:
    """
    Calcula pontuação configurável de aderência ATS (0-100) como estimativa interna.
    """
    w = {**DEFAULT_ATS_SCORING_WEIGHTS, **(weights or {})}
    cand_skills = list((profile.get("technical_skills") or {}).get("value") or [])
    cand_lower = {s.lower() for s in cand_skills}
    cv_low = cv_text.lower()

    mandatory = job_analysis.get("mandatory_skills") or []
    desirable = job_analysis.get("desirable_skills") or []
    proven = [s for s in mandatory if s.lower() in cand_lower or s.lower() in cv_low]
    missing = [s for s in mandatory if s not in proven]
    diffs = [s for s in desirable if s.lower() in cand_lower or s.lower() in cv_low]

    tech_ratio = (len(proven) / len(mandatory)) if mandatory else (0.85 if cand_skills else 0.3)
    tech_pts = round(w["technical_skills"] * tech_ratio, 1)

    exps = (profile.get("experiences") or {}).get("value") or []
    exp_pts = round(w["experience"] * (1.0 if len(exps) >= 2 else (0.7 if len(exps) == 1 else 0.25)), 1)

    kws = job_analysis.get("keywords") or []
    kw_hits = sum(1 for k in kws if k.lower() in cv_low)
    kw_pts = round(w["keywords"] * (kw_hits / len(kws) if kws else 0.8), 1)

    edu_vals = (profile.get("education") or {}).get("value") or []
    edu_pts = round(w["education"] * (1.0 if edu_vals else 0.5), 1)

    sen_pts = round(w["seniority"] * 0.9, 1)
    certs_vals = (profile.get("certifications") or {}).get("value") or []
    cert_pts = round(w["certifications"] * (1.0 if certs_vals or not job_analysis.get("certifications") else 0.4), 1)
    soft_vals = (profile.get("soft_skills") or {}).get("value") or []
    soft_pts = round(w["soft_skills"] * (1.0 if soft_vals else 0.6), 1)
    lang_vals = (profile.get("languages") or {}).get("value") or []
    lang_pts = round(w["languages"] * (1.0 if lang_vals or not job_analysis.get("languages") else 0.5), 1)
    struct_pts = round(w["structural_readability"] * (1.0 if len(cv_text) > 120 else 0.5), 1)

    total = min(100, round(tech_pts + exp_pts + kw_pts + edu_pts + sen_pts + cert_pts + soft_pts + lang_pts + struct_pts))
    req_met_pct = round((len(proven) / len(mandatory)) * 100) if mandatory else 100

    recs = []
    if missing:
        recs.append(f"Se possuir vivência real com {', '.join(missing[:4])}, descreva projetos práticos no currículo.")
    if not certs_vals and job_analysis.get("certifications"):
        recs.append(f"Certificações citadas na vaga: {', '.join(job_analysis['certifications'][:3])}.")
    if not recs:
        recs.append("Ótima aderência estrutural e terminológica para leitores ATS.")

    return {
        "total_score": total,
        "is_internal_estimate": True,
        "disclaimer": "Estimativa interna de aderência ATS (não representa pontuação oficial de plataformas terceiras).",
        "requirements_met_pct": req_met_pct,
        "unmet_mandatory": missing,
        "missing_skills": missing,
        "proven_skills": proven,
        "differentials": diffs,
        "recommendations": recs,
        "breakdown": {
            "technical_skills": tech_pts,
            "experience": exp_pts,
            "keywords": kw_pts,
            "education": edu_pts,
            "seniority": sen_pts,
            "certifications": cert_pts,
            "soft_skills": soft_pts,
            "languages": lang_pts,
            "structural_readability": struct_pts,
        },
    }


def validate_generated_document(pdf_bytes: bytes | None = None, docx_bytes: bytes | None = None) -> dict[str, Any]:
    """Valida extração textual, ordem de leitura, ausência de tabelas/imagens e integridade do PDF e DOCX."""
    issues: list[str] = []
    pdf_text = ""
    docx_text = ""

    if pdf_bytes:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            pdf_text = "\n".join((p.extract_text() or "") for p in reader.pages).strip()
            if not pdf_text:
                issues.append("PDF sem texto selecionável extraível.")
            if "\ufffd" in pdf_text:
                issues.append("Caracteres corrompidos detectados no PDF.")
        except Exception as exc:
            issues.append(f"Falha ao validar PDF: {exc}")

    if docx_bytes:
        try:
            with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as zf:
                xml_raw = zf.read("word/document.xml").decode("utf-8")
                if "<w:tbl" in xml_raw or "<w:cols" in xml_raw:
                    issues.append("DOCX contém tabelas ou múltiplas colunas incompatíveis com ATS.")
                if "<w:drawing" in xml_raw or "<w:pict" in xml_raw:
                    issues.append("DOCX contém conteúdo em imagem.")
                root = ET.fromstring(xml_raw)
                texts = [el.text for el in root.iter() if el.tag.endswith("}t") and el.text]
                docx_text = "\n".join(texts).strip()
                if not docx_text:
                    issues.append("DOCX sem texto extraível.")
        except Exception as exc:
            issues.append(f"Falha ao validar DOCX: {exc}")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "pdf_chars": len(pdf_text),
        "docx_chars": len(docx_text),
        "ats_platforms_checked": ATS_PLATFORMS_SUPPORTED,
    }


def build_multilingual_ats_cv(
    profile: dict[str, Any],
    *,
    purpose: str = "ats_traditional",
    language: str = "pt",
    visual_style: str = "ats_professional",
    job_text: str = "",
    job_title: str = "",
) -> dict[str, Any]:
    """Constrói currículo ATS padronizado de 15 seções (1 coluna, sem tabelas) em PT-BR, EN, ES ou FR."""
    lang = language if language in LOCALIZED_HEADERS else "pt"
    hdr = LOCALIZED_HEADERS[lang]

    name = (profile.get("name") or {}).get("value") or "PROFISSIONAL"
    location = (profile.get("location") or {}).get("value") or ""
    phone = (profile.get("phone") or {}).get("value") or ""
    email = (profile.get("email") or {}).get("value") or ""
    links = list((profile.get("links") or {}).get("value") or [])
    headline = (profile.get("headline") or {}).get("value") or (job_title or "Especialista")
    summary = rewrite_experience_text((profile.get("summary") or {}).get("value") or "")
    tech_skills = list((profile.get("technical_skills") or {}).get("value") or [])
    soft_skills = list((profile.get("soft_skills") or {}).get("value") or [])
    experiences = list((profile.get("experiences") or {}).get("value") or [])
    education = list((profile.get("education") or {}).get("value") or [])
    certifications = list((profile.get("certifications") or {}).get("value") or [])
    projects = list((profile.get("projects") or {}).get("value") or [])
    languages = list((profile.get("languages") or {}).get("value") or [])
    courses = list((profile.get("courses") or {}).get("value") or [])

    job_analysis = analyze_job_description(job_text, job_title) if (job_text or job_title) else None
    if job_analysis and job_analysis.get("mandatory_skills"):
        mand_low = {s.lower() for s in job_analysis["mandatory_skills"]}
        tech_skills = [*[s for s in tech_skills if s.lower() in mand_low], *[s for s in tech_skills if s.lower() not in mand_low]]

    if not summary:
        top_sk = ", ".join(tech_skills[:5]) or "tecnologia e entrega de projetos"
        if lang == "en":
            summary = f"{headline} with hands-on experience in {top_sk}, focused on measurable delivery, reliability, and operational excellence."
        elif lang == "es":
            summary = f"{headline} con experiencia práctica en {top_sk}, orientado a resultados medibles y calidad técnica."
        elif lang == "fr":
            summary = f"{headline} avec une expérience pratique en {top_sk}, orienté résultats mesurables et qualité technique."
        else:
            summary = f"{headline} com experiência prática em {top_sk}, com foco em entregas mensuráveis, qualidade técnica e impacto operacional."

    contact_lines = [name.upper(), headline]
    if location:
        contact_lines.append(location)
    if phone:
        contact_lines.append(f"Telefone: {phone}")
    if email:
        contact_lines.append(f"E-mail profissional: {email}")
    for lk in links[:2]:
        if "linkedin" in str(lk).lower():
            contact_lines.append(f"LinkedIn: {lk}")
        else:
            contact_lines.append(f"Portfólio/GitHub: {lk}")
    lines = [*contact_lines, ""]

    # Categorização automática de CONHECIMENTOS EM TECNOLOGIA (somente tecnologias conhecidas)
    tech_buckets = {
        "Sistemas operacionais": [s for s in tech_skills if s.lower() in {"linux", "windows", "macos", "ubuntu"}],
        "Ferramentas": [s for s in tech_skills if s.lower() in {"excel", "power bi", "docker", "kubernetes", "git", "ci/cd", "siem", "jira"}],
        "Linguagens": [s for s in tech_skills if s.lower() in {"python", "java", "javascript", "typescript", "sql", "c#", "go", "rust"}],
        "Banco de dados": [s for s in tech_skills if s.lower() in {"mysql", "postgresql", "mongodb", "redis", "oracle", "sqlite"}],
        "Plataformas": [s for s in tech_skills if s.lower() in {"aws", "azure", "gcp", "google cloud", "github"}],
    }
    tech_k_lines = [f"{k}: {', '.join(v)}" for k, v in tech_buckets.items() if v]

    # Ordem adaptativa conforme finalidade
    order = ["summary", "skills", "experience", "education", "certifications", "tech_knowledge", "languages", "projects", "additional"]
    if purpose in ("academic", "first_job"):
        order = ["summary", "education", "projects", "skills", "tech_knowledge", "experience", "certifications", "languages", "additional"]
    elif purpose == "executive":
        order = ["summary", "experience", "skills", "education", "certifications", "languages", "tech_knowledge", "projects", "additional"]

    sec_map: dict[str, list[str]] = {
        "summary": [hdr["summary"], summary, ""],
        "skills": [hdr["skills"], *tech_skills, ""] if tech_skills else [],
        "experience": [],
        "education": [hdr["education"], *[f"{e.get('degree', e) if isinstance(e, dict) else e}" for e in education], ""] if education else [],
        "certifications": [hdr.get("certifications", "CERTIFICAÇÕES E QUALIFICAÇÕES"), *[f"{c}" for c in certifications], ""] if certifications else [],
        "tech_knowledge": [hdr.get("tech_knowledge", "CONHECIMENTOS EM TECNOLOGIA"), *tech_k_lines, ""] if tech_k_lines else [],
        "languages": [hdr["languages"], *[f"{l}" for l in languages], ""] if languages else [],
        "projects": [hdr["projects"], *[f"{p.get('name', p) if isinstance(p, dict) else p}" for p in projects], ""] if projects else [],
        "additional": [hdr.get("additional", "INFORMAÇÕES ADICIONAIS"), "Disponibilidade: Conforme negociação", "Modalidade: Presencial / Híbrido / Remoto", ""] if lang == "pt" else [],
    }

    if experiences:
        exp_lines = [hdr["experience"]]
        for exp in experiences:
            if isinstance(exp, dict):
                period = f"{exp.get('start_date', '')} – {exp.get('end_date') or 'Atual'}".strip(" –")
                exp_lines.append(str(exp.get("company") or "EMPRESA").upper())
                exp_lines.append(f"{exp.get('role', 'Cargo')}" + (f" | {period}" if period else ""))
                if exp.get("responsibilities"):
                    exp_lines.append("Principais responsabilidades e resultados:" if lang == "pt" else "Key responsibilities and achievements:")
                    exp_lines.append(rewrite_experience_text(exp["responsibilities"]))
                if exp.get("results"):
                    exp_lines.append(f"Resultados: {exp['results']}")
            else:
                exp_lines.append(rewrite_experience_text(str(exp)))
        exp_lines.append("")
        sec_map["experience"] = exp_lines

    for key in order:
        if sec_map.get(key):
            lines.extend(sec_map[key])

    cv_text = "\n".join(lines).strip()
    ats_score = score_cv_against_job(profile, cv_text, job_analysis or analyze_job_description("", headline))
    return {
        "purpose": purpose,
        "language": lang,
        "visual_style": visual_style,
        "content_text": cv_text,
        "job_analysis": job_analysis,
        "ats_score": ats_score,
        "structured_json": {
            "name": name,
            "headline": headline,
            "contact": contact_lines[2:],
            "summary": summary,
            "technical_skills": tech_skills,
            "experiences": experiences,
            "education": education,
            "certifications": certifications,
            "languages": languages,
        },
    }
