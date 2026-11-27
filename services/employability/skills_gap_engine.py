from __future__ import annotations

from typing import Any

from services.linkedin_cv.ats_engine import analyze_job_description
from services.resume_parser import extract_skills

EQUIVALENCE_GROUPS: dict[str, list[str]] = {
    "postgresql": ["mysql", "sql"],
    "mysql": ["postgresql", "sql"],
    "react": ["vue.js", "next.js", "typescript"],
    "aws": ["azure", "gcp"],
    "azure": ["aws", "gcp"],
    "pandas": ["polars", "sql"],
    "tensorflow": ["pytorch"],
    "pytorch": ["tensorflow"],
}

CERT_SUGGESTIONS: dict[str, str] = {
    "aws": "AWS Certified Cloud Practitioner / Solutions Architect",
    "azure": "Microsoft Certified: Azure Fundamentals / Administrator",
    "siem": "CompTIA Security+ / Blue Team Level 1",
    "kubernetes": "CKAD / CKA (CNCF)",
    "python": "PCEP / PCAP (Python Institute)",
    "sql": "Oracle / Microsoft Data Fundamentals",
}


def analyze_skills_gap(
    master_profile: dict[str, Any],
    job_description: str,
    job_title: str = "",
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Módulo 2 — Analisador de Lacunas Profissionais (Skills Gap Analysis).
    Compara Perfil Mestre vs. Vaga sem confundir ausência de informação com falta de conhecimento.
    """
    ja = analyze_job_description(job_description, job_title)
    cand_skills = [str(s) for s in (master_profile.get("technical_skills") or [])]
    cand_low = {s.lower() for s in cand_skills}

    exps = master_profile.get("experiences") or []
    projs = master_profile.get("projects") or []
    exp_text = " ".join(
        f"{e.get('role', '')} {e.get('responsibilities', '')} {e.get('results', '')} {' '.join(e.get('technologies') or [])}"
        if isinstance(e, dict) else str(e)
        for e in [*exps, *projs]
    ).lower()
    exp_skills_low = {s.lower() for s in extract_skills(exp_text)} if exp_text.strip() else set()

    matrix: list[dict[str, Any]] = []
    unmet_mandatory: list[str] = []
    development_plan: list[dict[str, Any]] = []

    all_req = [(s, "Obrigatória") for s in (ja.get("mandatory_skills") or [])] + [
        (s, "Desejável") for s in (ja.get("desirable_skills") or []) if s not in (ja.get("mandatory_skills") or [])
    ]

    proven_count = 0
    partial_count = 0
    for skill, req_type in all_req:
        sk_low = skill.lower()
        equivs = [eq for eq in EQUIVALENCE_GROUPS.get(sk_low, []) if eq in cand_low or eq in exp_skills_low]

        if sk_low in exp_skills_low or (sk_low in cand_low and sk_low in exp_text):
            status = "Comprovada"
            proven_count += 1
            demo_lvl = "Prático / Projetos"
        elif sk_low in cand_low or equivs:
            status = "Parcial"
            partial_count += 1
            demo_lvl = f"Declarado ou equivalente ({', '.join(equivs)})" if equivs else "Declarado sem projeto associado"
        else:
            status = "Não identificada"
            demo_lvl = "Não identificada no perfil (necessita confirmação)"
            if req_type == "Obrigatória":
                unmet_mandatory.append(skill)

        matrix.append({
            "skill": skill,
            "requirement_type": req_type,
            "status": status,
            "demonstrated_level": demo_lvl,
        })

        if status != "Comprovada":
            if req_type == "Obrigatória" and status == "Não identificada":
                prio = "Prioridade crítica"
            elif req_type == "Obrigatória":
                prio = "Alta prioridade"
            elif status == "Não identificada":
                prio = "Média prioridade"
            else:
                prio = "Baixa prioridade"

            development_plan.append({
                "skill": skill,
                "reason": f"Requisito {req_type.lower()} identificado na descrição da vaga.",
                "expected_level": "Aplicação prática em ambiente produtivo" if req_type == "Obrigatória" else "Conhecimento funcional",
                "demonstrated_level": demo_lvl,
                "priority": prio,
                "knowledge_needed": f"Fundamentos, boas práticas e resolução de problemas reais com {skill}.",
                "study_suggestion": f"Revisar documentação oficial e padrões arquiteturais de {skill}.",
                "recommended_project": f"Construir projeto prático demonstrando {skill} integrado ao seu portfólio/GitHub.",
                "certification": CERT_SUGGESTIONS.get(sk_low),
                "proof_criterion": f"Publicar repositório/entrega documentando uso de {skill} com métricas ou testes.",
            })

    prio_order = {"Prioridade crítica": 0, "Alta prioridade": 1, "Média prioridade": 2, "Baixa prioridade": 3}
    development_plan.sort(key=lambda d: prio_order.get(d["priority"], 4))

    # 6 indicadores independentes (0-100)
    total_req = max(1, len(all_req))
    tech_ind = round(((proven_count + partial_count * 0.55) / total_req) * 100) if all_req else 80
    soft_cand = master_profile.get("soft_skills") or []
    soft_req = ja.get("soft_skills") or []
    behav_ind = round((sum(1 for s in soft_req if any(s.lower() in c.lower() for c in soft_cand)) / max(1, len(soft_req))) * 100) if soft_req else (80 if soft_cand else 65)
    exp_ind = min(100, 40 + len(exps) * 20) if exps else 25
    edu_cand = master_profile.get("education") or []
    acad_ind = 95 if edu_cand else (70 if ja.get("required_education") == "Não especificado" else 35)
    cert_cand = master_profile.get("certifications") or []
    cert_req = ja.get("certifications") or []
    cert_ind = 95 if (cert_cand or not cert_req) else 40
    lang_cand = master_profile.get("languages") or []
    lang_req = ja.get("languages") or []
    lang_ind = 90 if (lang_cand or not lang_req) else 45

    w = weights or {"technical": 0.35, "behavioral": 0.10, "experience": 0.25, "academic": 0.10, "certifications": 0.10, "languages": 0.10}
    overall = round(
        tech_ind * w["technical"]
        + behav_ind * w["behavioral"]
        + exp_ind * w["experience"]
        + acad_ind * w["academic"]
        + cert_ind * w["certifications"]
        + lang_ind * w["languages"]
    )
    overall = max(0, min(100, overall))

    readiness = "Sim, alta prontidão" if (not unmet_mandatory and overall >= 75) else (
        "Parcialmente preparado — há requisitos obrigatórios sem comprovação" if unmet_mandatory else "Em preparação"
    )

    return {
        "overall_adherence": overall,
        "mandatory_alert": bool(unmet_mandatory),
        "unmet_mandatory_requirements": unmet_mandatory,
        "indicators": {
            "technical": tech_ind,
            "behavioral": behav_ind,
            "experience": exp_ind,
            "academic": acad_ind,
            "certifications": cert_ind,
            "languages": lang_ind,
        },
        "competency_matrix": matrix,
        "development_plan": development_plan,
        "job_analysis": ja,
        "strategic_qa": {
            "is_ready": readiness,
            "key_differentials": [m["skill"] for m in matrix if m["status"] == "Comprovada"][:6],
            "requirements_to_develop": [d["skill"] for d in development_plan[:5]],
            "experiences_to_highlight": [e.get("role", e) if isinstance(e, dict) else str(e) for e in exps[:3]],
            "recommended_certifications": [d["certification"] for d in development_plan if d.get("certification")][:3],
            "recommended_projects": [d["recommended_project"] for d in development_plan[:3]],
        },
    }
