from __future__ import annotations

from collections import Counter
from typing import Any

from services.employability.ats_simulator import simulate_ats_reading
from services.employability.database import EmployabilityStore
from services.employability.skills_gap_engine import analyze_skills_gap
from services.linkedin_cv.ats_engine import build_multilingual_ats_cv
from services.linkedin_cv.profile_and_cv import CvBuilderService, LinkedinDataNormalizer


def run_opportunity_cv_pipeline(
    store: EmployabilityStore,
    user_id: str,
    opp_id: str,
    *,
    language: str = "pt",
    purpose: str = "job_tailored",
) -> dict[str, Any]:
    """
    Módulo 4 — Fluxo integrado de 9 etapas:
    Oportunidade -> Análise -> Skills Gap -> Personalização -> Geração -> Simulação ATS -> Otimização -> Aprovação/Registro.
    """
    opp = store.get_opportunity(user_id, opp_id)
    if not opp:
        raise LookupError("Oportunidade não encontrada.")
    master = store.get_master_profile(user_id)
    if not master:
        raise ValueError("Cadastre seu Perfil Profissional Mestre antes de gerar currículos por oportunidade.")

    # Etapa 3: Skills Gap Analysis
    gap_report = analyze_skills_gap(master, opp["description"], opp["title"])

    # Etapa 4 & 5: Normaliza a partir do Perfil Mestre (sem falsificar histórico) e gera CV
    norm_profile = LinkedinDataNormalizer().normalize(manual_data=master)
    built = build_multilingual_ats_cv(
        norm_profile,
        purpose=purpose,
        language=language,
        job_text=opp["description"],
        job_title=opp["title"],
    )

    # Etapa 6 & 7: Simulação ATS real no PDF gerado
    cv_builder = CvBuilderService()
    pdf_bytes = cv_builder.export_pdf_bytes(built["content_text"])
    ats_sim = simulate_ats_reading(file_bytes=pdf_bytes, filename="generated.pdf", job_description=opp["description"])

    changelog = [
        f"Versão gerada para {opp['title']} @ {opp['company']} ({language.upper()}).",
        f"Score ATS simulado: {ats_sim['extraction_pct']}% extração | Aderência Skills Gap: {gap_report['overall_adherence']}/100.",
    ]
    version = store.save_opportunity_cv_version(
        user_id,
        opportunity_id=opp_id,
        company=opp["company"],
        role=opp["title"],
        content_text=built["content_text"],
        structured=built["structured_json"],
        ats_score=int(built["ats_score"]["total_score"]),
        ats_report=ats_sim,
        skills_gap=gap_report,
        status="Currículo preparado" if opp["status"] in ("Oportunidade identificada", "Em análise") else opp["status"],
        changelog=changelog,
    )
    if opp["status"] in ("Oportunidade identificada", "Em análise"):
        store.update_opportunity_status(user_id, opp_id, status="Currículo preparado")

    return {
        "opportunity": store.get_opportunity(user_id, opp_id),
        "skills_gap": gap_report,
        "ats_simulation": ats_sim,
        "generated": built,
        "version": version,
    }


def build_dashboard_and_learning(
    store: EmployabilityStore,
    user_id: str,
    filters: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Módulo 3.5 + Recomendação Estratégica:
    Painel com indicadores reais, filtros e aprendizado histórico baseado em candidaturas/entrevistas.
    """
    f = filters or {}
    opps = store.list_opportunities(user_id)
    versions = store.list_cv_versions(user_id)

    # Filtros
    filtered_opps = []
    for o in opps:
        if f.get("company") and f["company"].lower() not in o["company"].lower():
            continue
        if f.get("title") and f["title"].lower() not in o["title"].lower():
            continue
        if f.get("area") and f["area"].lower() not in o["area"].lower():
            continue
        if f.get("status") and f["status"] != o["status"]:
            continue
        if f.get("location") and f["location"].lower() not in o["location"].lower():
            continue
        filtered_opps.append(o)

    applied_stages = {"Candidatura enviada", "Triagem", "Entrevista", "Aprovação", "Reprovação"}
    interview_stages = {"Entrevista", "Aprovação"}
    closed_stages = {"Aprovação", "Reprovação", "Encerrada"}

    total_opps = len(filtered_opps)
    cvs_generated = len(versions)
    applications_sent = sum(1 for o in filtered_opps if o["status"] in applied_stages or o["applied_confirmed"])
    interviews = sum(1 for o in filtered_opps if o["status"] in interview_stages)
    closed_count = sum(1 for o in filtered_opps if o["status"] in closed_stages)
    in_progress = total_opps - closed_count

    avg_ats = round(sum(v["ats_score"] for v in versions) / len(versions), 1) if versions else 0.0

    req_counter: Counter[str] = Counter()
    gap_counter: Counter[str] = Counter()
    area_interviews: Counter[str] = Counter()
    area_apps: Counter[str] = Counter()

    opp_by_id = {o["id"]: o for o in opps}
    for o in opps:
        if o["status"] in applied_stages or o["applied_confirmed"]:
            area_apps[o["area"]] += 1
        if o["status"] in interview_stages:
            area_interviews[o["area"]] += 1

    for v in versions:
        sg = v.get("skills_gap") or {}
        for m in sg.get("competency_matrix") or []:
            req_counter[m["skill"]] += 1
            if m["status"] == "Não identificada":
                gap_counter[m["skill"]] += 1

    best_areas = [
        {
            "area": area,
            "applications": cnt,
            "interviews": area_interviews[area],
            "interview_rate_pct": round((area_interviews[area] / cnt) * 100) if cnt else 0,
        }
        for area, cnt in area_apps.most_common(5)
    ]
    top_versions = sorted(versions, key=lambda v: (1 if opp_by_id.get(v["opportunity_id"], {}).get("status") in interview_stages else 0, v["ats_score"]), reverse=True)[:5]

    return {
        "kpis": {
            "total_opportunities": total_opps,
            "cvs_generated": cvs_generated,
            "applications_sent": applications_sent,
            "interviews": interviews,
            "in_progress": in_progress,
            "closed": closed_count,
            "avg_ats_score": avg_ats,
        },
        "top_requested_skills": [{"skill": k, "count": c} for k, c in req_counter.most_common(6)],
        "recurring_gaps": [{"skill": k, "count": c} for k, c in gap_counter.most_common(6)],
        "learning_insights": {
            "interview_rate_pct": round((interviews / applications_sent) * 100) if applications_sent else 0,
            "best_converting_areas": best_areas,
            "top_performing_versions": [{"id": v["id"], "role": v["role"], "company": v["company"], "ats_score": v["ats_score"], "status": v["status"]} for v in top_versions],
        },
        "opportunities": filtered_opps,
        "versions": versions,
    }
