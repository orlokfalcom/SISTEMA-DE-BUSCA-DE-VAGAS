from __future__ import annotations

import io
import os

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.middleware.proxy_fix import ProxyFix

from services.job_matcher import (
    compare_custom_job_description,
    compute_skill_gap_analytics,
    match_jobs,
)
from services.job_sources import build_external_search_links, collect_jobs
from services.resume_parser import (
    SKILL_CATALOG,
    generate_sample_resume_pdf,
    parse_resume_pdf,
    suggest_roles,
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)


@app.after_request
def add_security_headers(response):
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
    )

    ranked_jobs = match_jobs(
        jobs=raw_jobs,
        candidate_skills=profile.skills,
        candidate_text=profile.raw_text,
        candidate_seniority=profile.seniority,
        suggested_roles=profile.suggested_roles,
        modality_filter=modality_filter,
    )

    skill_gaps = compute_skill_gap_analytics(ranked_jobs)
    external_links = build_external_search_links(profile.skills, profile.suggested_roles)

    return jsonify(
        {
            "profile": profile.to_dict(include_raw_text=False),
            "resume_text_snippet": profile.raw_text[:15000],
            "jobs": ranked_jobs,
            "total_jobs": len(ranked_jobs),
            "skill_gaps": skill_gaps,
            "sources": sources_status,
            "external_links": external_links,
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
    )

    skill_gaps = compute_skill_gap_analytics(ranked_jobs)
    external_links = build_external_search_links(skills, roles)

    return jsonify(
        {
            "suggested_roles": roles,
            "jobs": ranked_jobs,
            "total_jobs": len(ranked_jobs),
            "skill_gaps": skill_gaps,
            "sources": sources_status,
            "external_links": external_links,
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


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"

    if debug:
        app.run(host=host, port=port, debug=True)
    else:
        from waitress import serve

        print(f"VagaMatch PDF rodando em produção em http://{host}:{port}")
        serve(app, host=host, port=port, threads=8)
