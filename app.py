from __future__ import annotations

import io
import os
from datetime import datetime

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.middleware.proxy_fix import ProxyFix

from services.job_matcher import (
    compare_custom_job_description,
    compute_skill_gap_analytics,
    match_jobs,
    recommend_courses,
)
from services.job_sources import build_external_search_links, collect_jobs
from services.resume_parser import (
    SKILL_CATALOG,
    build_ats_improvement_plan,
    extract_skills,
    generate_sample_resume_pdf,
    parse_resume_pdf,
    suggest_roles,
)
from services.security_ai import AutonomousSecurityAI

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
security_ai = AutonomousSecurityAI(log_dir=os.path.join(os.path.dirname(__file__), "security_logs"))


@app.before_request
def autonomous_intrusion_guard():
    verdict = security_ai.inspect_flask_request(request)
    if verdict["blocked"]:
        return (
            jsonify(
                {
                    "error": "Acesso bloqueado pelo motor autônomo de segurança.",
                    "risk_score": verdict["risk_score"],
                    "categories": verdict["categories"],
                }
            ),
            403,
        )


@app.after_request
def add_security_headers(response):
    security_ai.observe_flask_response(request, response.status_code)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"error": "O arquivo PDF excede o limite máximo de 10 MB."}), 413


@app.errorhandler(500)
def internal_error(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Erro interno no servidor. Tente novamente."}), 500
    return "Erro interno no servidor.", 500


@app.get("/")
def index():
    return render_template("index.html", available_skills=sorted(SKILL_CATALOG.keys()))


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/security/report")
def security_report():
    if not security_ai.is_authorized_for_security_api(request):
        return jsonify({"error": "Acesso não autorizado ao relatório de segurança."}), 403
    return jsonify(security_ai.get_summary())


PREFS_FILE = os.path.join(os.path.dirname(__file__), "security_logs", "user_preferences.json")


def _load_user_prefs() -> dict:
    try:
        if os.path.exists(PREFS_FILE):
            import json as _json
            with open(PREFS_FILE, "r", encoding="utf-8") as fh:
                return _json.load(fh)
    except Exception:
        pass
    return {"preferred_language": "pt"}


@app.get("/api/preferences/language")
def get_language_preference():
    prefs = _load_user_prefs()
    return jsonify({"preferred_language": prefs.get("preferred_language", "pt")})


@app.post("/api/preferences/language")
def set_language_preference():
    import json as _json
    data = request.get_json(silent=True) or {}
    lang = str(data.get("preferred_language") or "").strip()
    if not lang or len(lang) > 12:
        return jsonify({"error": "Código de idioma inválido."}), 400
    os.makedirs(os.path.dirname(PREFS_FILE), exist_ok=True)
    prefs = _load_user_prefs()
    prefs["preferred_language"] = lang
    with open(PREFS_FILE, "w", encoding="utf-8") as fh:
        _json.dump(prefs, fh, ensure_ascii=False, indent=2)
    return jsonify({"preferred_language": lang, "saved": True})


@app.get("/api/live-jobs")
def live_jobs_feed():
    """Carrega automaticamente vagas recentes (empresas + portais) para exibição inicial e pré-aquecimento."""
    force_refresh = request.args.get("force_refresh", "false").lower() == "true"
    deep_search = request.args.get("deep_search", "false").lower() == "true"
    raw_jobs, sources_status = collect_jobs(
        source_filter="all",
        primary_skill="",
        include_live=True,
        deep_search=deep_search,
        user_country="Brasil",
        force_refresh=force_refresh,
    )
    ranked_jobs = match_jobs(
        jobs=raw_jobs,
        candidate_skills=[],
        candidate_text="",
        candidate_seniority="Pleno",
        sort_by="recent",
        user_country="Brasil",
    )
    return jsonify(
        {
            "jobs": ranked_jobs[:24],
            "total_jobs": len(ranked_jobs),
            "sources": sources_status,
            "updated_at": datetime.now().strftime("%H:%M:%S"),
        }
    )


@app.get("/api/sample-resume")
def sample_resume():
    """Disponibiliza um currículo PDF de exemplo para download ou teste rápido."""
    pdf_bytes = generate_sample_resume_pdf()
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name="curriculo_exemplo_mariana_silva.pdf",
    )


@app.post("/api/analyze")
def analyze_resume():
    """Recebe um currículo PDF, extrai o perfil + auditoria ATS e retorna vagas ranqueadas."""
    use_sample = request.form.get("use_sample", "false").lower() == "true"
    source_filter = request.form.get("source", "all").strip().lower()
    modality_filter = request.form.get("modality", "").strip()
    include_live = request.form.get("include_live", "true").lower() != "false"
    deep_search = request.form.get("deep_search", "true").lower() != "false"

    if use_sample:
        pdf_stream = io.BytesIO(generate_sample_resume_pdf())
        filename = "curriculo_exemplo_mariana_silva.pdf"
    else:
        if "file" not in request.files:
            return jsonify({"error": "Envie um arquivo PDF no campo 'file'."}), 400
        uploaded = request.files["file"]
        if not uploaded or not uploaded.filename:
            return jsonify({"error": "Nenhum arquivo selecionado."}), 400
        if not uploaded.filename.lower().endswith(".pdf"):
            return jsonify({"error": "Formato inválido. Envie apenas arquivos .pdf."}), 400
        pdf_stream = uploaded.stream
        filename = uploaded.filename

    try:
        profile = parse_resume_pdf(pdf_stream, filename=filename)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception:
        return jsonify({"error": "Não foi possível ler o PDF enviado. Verifique se o arquivo está íntegro."}), 400

    primary_skill = profile.skills[0] if profile.skills else ""
    raw_jobs, sources_status = collect_jobs(
        source_filter=source_filter,
        primary_skill=primary_skill,
        include_live=include_live,
        deep_search=deep_search,
        skills=profile.skills,
        suggested_roles=profile.suggested_roles,
        user_country=profile.country,
    )

    ranked_jobs = match_jobs(
        jobs=raw_jobs,
        candidate_skills=profile.skills,
        candidate_text=profile.raw_text,
        candidate_seniority=profile.seniority,
        suggested_roles=profile.suggested_roles,
        modality_filter=modality_filter,
        user_country=profile.country,
    )

    skill_gaps = compute_skill_gap_analytics(ranked_jobs)
    recommended_courses = recommend_courses(skill_gaps, profile.skills, profile.suggested_roles)
    external_links = build_external_search_links(profile.skills, profile.suggested_roles, user_country=profile.country)

    return jsonify(
        {
            "profile": profile.to_dict(include_raw_text=False),
            "resume_text_snippet": profile.raw_text[:15000],
            "jobs": ranked_jobs,
            "total_jobs": len(ranked_jobs),
            "skill_gaps": skill_gaps,
            "recommended_courses": recommended_courses,
            "sources": sources_status,
            "external_links": external_links,
            "updated_at": datetime.now().strftime("%H:%M:%S"),
        }
    )


@app.post("/api/search")
def search_jobs_by_profile():
    """Refaz a busca e o ranqueamento quando o usuário edita skills ou filtros."""
    payload = request.get_json(silent=True) or {}
    raw_skills = payload.get("skills", [])
    if not isinstance(raw_skills, list):
        return jsonify({"error": "O campo 'skills' deve ser uma lista de habilidades."}), 400
    skills = [str(s).strip() for s in raw_skills if str(s).strip()]
    seniority = str(payload.get("seniority") or "Pleno").strip()
    resume_text = str(payload.get("resume_text") or "")
    source_filter = str(payload.get("source") or "all").strip().lower()
    modality_filter = str(payload.get("modality") or "").strip()
    seniority_filter = str(payload.get("job_seniority") or "").strip()
    search_query = str(payload.get("query") or "").strip()
    sort_by = str(payload.get("sort_by") or "match").strip().lower()
    include_live = bool(payload.get("include_live", True))
    deep_search = bool(payload.get("deep_search", True))
    force_refresh = bool(payload.get("force_refresh", False))
    user_country = str(payload.get("country") or "Brasil").strip()
    try:
        min_score = max(0, min(100, int(payload.get("min_score") or 0)))
    except (ValueError, TypeError):
        return jsonify({"error": "O campo 'min_score' deve ser um número inteiro entre 0 e 100."}), 400

    roles = suggest_roles(skills, resume_text)
    primary_skill = skills[0] if skills else ""

    raw_jobs, sources_status = collect_jobs(
        source_filter=source_filter,
        primary_skill=primary_skill,
        include_live=include_live,
        deep_search=deep_search,
        skills=skills,
        suggested_roles=roles,
        user_country=user_country,
        force_refresh=force_refresh,
    )

    ranked_jobs = match_jobs(
        jobs=raw_jobs,
        candidate_skills=skills,
        candidate_text=resume_text,
        candidate_seniority=seniority,
        suggested_roles=roles,
        modality_filter=modality_filter,
        seniority_filter=seniority_filter,
        search_query=search_query,
        min_score=min_score,
        sort_by=sort_by,
        user_country=user_country,
    )

    skill_gaps = compute_skill_gap_analytics(ranked_jobs)
    recommended_courses = recommend_courses(skill_gaps, skills, roles)
    external_links = build_external_search_links(skills, roles, user_country=user_country)

    return jsonify(
        {
            "suggested_roles": roles,
            "jobs": ranked_jobs,
            "total_jobs": len(ranked_jobs),
            "skill_gaps": skill_gaps,
            "recommended_courses": recommended_courses,
            "sources": sources_status,
            "external_links": external_links,
            "updated_at": datetime.now().strftime("%H:%M:%S"),
        }
    )


@app.post("/api/compare-job")
def compare_custom_job():
    """Compara o perfil atual do candidato com uma descrição de vaga colada manualmente."""
    payload = request.get_json(silent=True) or {}
    job_description = str(payload.get("job_description") or "").strip()
    job_title = str(payload.get("job_title") or "Vaga Personalizada").strip()
    if len(job_description) < 20:
        return jsonify({"error": "Cole uma descrição de vaga com pelo menos 20 caracteres."}), 400

    raw_skills = payload.get("skills", [])
    if not isinstance(raw_skills, list):
        return jsonify({"error": "O campo 'skills' deve ser uma lista de habilidades."}), 400
    skills = [str(s).strip() for s in raw_skills if str(s).strip()]
    seniority = str(payload.get("seniority") or "Pleno").strip()
    resume_text = str(payload.get("resume_text") or "")
    roles = suggest_roles(skills, resume_text)

    comparison = compare_custom_job_description(
        job_description=job_description,
        job_title=job_title,
        candidate_skills=skills,
        candidate_text=resume_text,
        candidate_seniority=seniority,
        suggested_roles=roles,
    )
    return jsonify({"comparison": comparison})


@app.post("/api/improve-resume")
def improve_resume():
    """Gera o plano detalhado de modificações ATS para aprimorar o currículo atual (inclusive ao vivo no editor)."""
    import re

    payload = request.get_json(silent=True) or {}
    resume_text = str(payload.get("resume_text") or "").strip()
    if not resume_text:
        return jsonify({"error": "Analise um currículo em PDF antes de gerar o plano de aprimoramento ATS."}), 400

    reparse = bool(payload.get("reparse", False))
    raw_skills = payload.get("skills", [])
    if not isinstance(raw_skills, list):
        return jsonify({"error": "O campo 'skills' deve ser uma lista de habilidades."}), 400

    skills = extract_skills(resume_text) if reparse else [str(s).strip() for s in raw_skills if str(s).strip()]
    seniority = str(payload.get("seniority") or "Pleno").strip()
    try:
        default_pages = max(1, min(3, round(len(resume_text.split()) / 420) or 1))
        pages = max(1, int(payload.get("pages") or default_pages))
        word_count = len(resume_text.split()) if reparse else max(0, int(payload.get("word_count") or len(resume_text.split())))
    except (ValueError, TypeError):
        return jsonify({"error": "Os campos 'pages' e 'word_count' devem ser números inteiros."}), 400
    suggested_roles = suggest_roles(skills, resume_text) if reparse else (payload.get("suggested_roles") or suggest_roles(skills, resume_text))
    skill_gaps = payload.get("skill_gaps") if isinstance(payload.get("skill_gaps"), list) else []

    if reparse:
        email_m = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", resume_text)
        phone_m = re.search(r"(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-.\s]?\d{4}", resume_text)
        linkedin_m = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%]+", resume_text, flags=re.IGNORECASE)
        github_m = re.search(r"(?:https?://)?(?:www\.)?github\.com/[a-zA-Z0-9\-_]+", resume_text, flags=re.IGNORECASE)
        email = email_m.group(0) if email_m else None
        phone = phone_m.group(0).strip() if phone_m else None
        linkedin = linkedin_m.group(0) if linkedin_m else None
        github = github_m.group(0) if github_m else None
    else:
        email = payload.get("email")
        phone = payload.get("phone")
        linkedin = payload.get("linkedin")
        github = payload.get("github")

    plan = build_ats_improvement_plan(
        raw_text=resume_text,
        pages=pages,
        word_count=word_count,
        skills=skills,
        suggested_roles=suggested_roles,
        seniority=seniority,
        email=email,
        phone=phone,
        linkedin=linkedin,
        github=github,
        skill_gaps=skill_gaps,
    )
    plan["detected_skills"] = skills
    plan["word_count"] = word_count
    return jsonify({"improvement_plan": plan})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"

    if debug:
        app.run(host=host, port=port, debug=True)
    else:
        from waitress import serve

        print(f"VagaPulse AI rodando em produção em http://{host}:{port}")
        serve(app, host=host, port=port, threads=8)
