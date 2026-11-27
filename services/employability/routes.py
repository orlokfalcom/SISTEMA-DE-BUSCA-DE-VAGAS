from __future__ import annotations

import os
import re
from typing import Any

from flask import Blueprint, Response, jsonify, make_response, request

from security_platform.detection_engine.detectors import inspect_file_static
from services.employability.ats_simulator import simulate_ats_reading
from services.employability.database import EmployabilityStore, PIPELINE_STAGES
from services.employability.opportunity_manager import build_dashboard_and_learning, run_opportunity_cv_pipeline
from services.employability.skills_gap_engine import analyze_skills_gap
from services.linkedin_cv.ats_engine import build_multilingual_ats_cv
from services.linkedin_cv.profile_and_cv import CvBuilderService, LinkedinDataNormalizer
from services.linkedin_cv.routes import _attach_session_cookies, _csrf_ok, _get_or_create_uid

employability_bp = Blueprint("employability", __name__)

_emp_store = EmployabilityStore(
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "security_logs", "employability.db")
)
_cv_builder = CvBuilderService()

PROMPT_INJECTION_RE = re.compile(
    r"(ignore\s+(?:all\s+)?previous\s+instructions|system\s+prompt|<\|im_start\|>|jailbreak)",
    re.IGNORECASE,
)


def _sanitize_text(raw: str) -> str:
    return PROMPT_INJECTION_RE.sub("[texto-removido-seguranca]", str(raw or "")).strip()


@employability_bp.route("/api/employability/master-profile", methods=["GET", "POST"])
def master_profile():
    uid, is_new = _get_or_create_uid()
    if request.method == "GET":
        resp = make_response(jsonify({"master_profile": _emp_store.get_master_profile(uid)}))
        return _attach_session_cookies(resp, uid, is_new)

    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    body = request.get_json(silent=True) or {}
    saved = _emp_store.save_master_profile(uid, body)
    resp = make_response(jsonify({"master_profile": saved}))
    return _attach_session_cookies(resp, uid, is_new)


@employability_bp.post("/api/employability/ats-simulate")
def ats_simulate():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()

    file_bytes: bytes | None = None
    filename = ""
    raw_text = ""
    job_desc = ""
    auto_fix = False

    if "file" in request.files:
        up = request.files["file"]
        filename = up.filename or "curriculo.pdf"
        file_bytes = up.read()
        scan = inspect_file_static(file_bytes, filename)
        if scan.get("malicious"):
            return jsonify({"error": "Arquivo bloqueado pela inspeção estática de segurança.", "findings": scan.get("findings")}), 400
        job_desc = _sanitize_text(request.form.get("job_description") or "")
        auto_fix = request.form.get("auto_fix", "false").lower() == "true"
    else:
        body = request.get_json(silent=True) or {}
        raw_text = _sanitize_text(body.get("raw_text") or "")
        job_desc = _sanitize_text(body.get("job_description") or "")
        auto_fix = bool(body.get("auto_fix"))

    report = simulate_ats_reading(file_bytes=file_bytes, filename=filename, raw_text=raw_text, job_description=job_desc)
    fixed_cv = None
    if auto_fix and report.get("extracted_text"):
        master = _emp_store.get_master_profile(uid) or {
            "name": (report["reconstructed_profile"]["candidate"].get("name") or "PROFISSIONAL"),
            "technical_skills": report.get("identified_keywords") or [],
            "summary": " ".join(s["text"] for s in report["reconstructed_profile"].get("summary") or [])[:500],
            "experiences": [e["text"] for e in report["reconstructed_profile"].get("experiences") or []],
            "education": [e["text"] for e in report["reconstructed_profile"].get("education") or []],
        }
        norm = LinkedinDataNormalizer().normalize(manual_data=master, resume_text=report["extracted_text"])
        fixed_cv = build_multilingual_ats_cv(norm, purpose="ats_traditional", job_text=job_desc)

    resp = make_response(jsonify({"simulation": report, "auto_fixed_cv": fixed_cv}))
    return _attach_session_cookies(resp, uid, is_new)


@employability_bp.post("/api/employability/skills-gap")
def skills_gap():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    body = request.get_json(silent=True) or {}
    master = body.get("master_profile") or _emp_store.get_master_profile(uid) or {}
    job_desc = _sanitize_text(body.get("job_description") or "")
    job_title = _sanitize_text(body.get("job_title") or "")
    weights = body.get("weights")
    result = analyze_skills_gap(master, job_desc, job_title, weights=weights)
    resp = make_response(jsonify({"skills_gap": result}))
    return _attach_session_cookies(resp, uid, is_new)


@employability_bp.route("/api/employability/opportunities", methods=["GET", "POST"])
def opportunities():
    uid, is_new = _get_or_create_uid()
    if request.method == "GET":
        resp = make_response(jsonify({"opportunities": _emp_store.list_opportunities(uid), "stages": PIPELINE_STAGES}))
        return _attach_session_cookies(resp, uid, is_new)

    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    body = request.get_json(silent=True) or {}
    company = _sanitize_text(body.get("company") or "Empresa")
    title = _sanitize_text(body.get("title") or "Oportunidade")
    opp = _emp_store.create_opportunity(
        uid,
        company=company,
        title=title,
        area=_sanitize_text(body.get("area") or "Tecnologia"),
        location=_sanitize_text(body.get("location") or "Remoto"),
        url=str(body.get("url") or "")[:300],
        description=_sanitize_text(body.get("description") or ""),
        notes=_sanitize_text(body.get("notes") or ""),
        next_steps=_sanitize_text(body.get("next_steps") or ""),
    )
    resp = make_response(jsonify({"opportunity": opp}))
    return _attach_session_cookies(resp, uid, is_new)


@employability_bp.post("/api/employability/opportunities/<opp_id>/status")
def update_opportunity_status(opp_id: str):
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    body = request.get_json(silent=True) or {}
    try:
        updated = _emp_store.update_opportunity_status(
            uid,
            opp_id,
            status=str(body.get("status") or ""),
            notes=_sanitize_text(body["notes"]) if "notes" in body else None,
            next_steps=_sanitize_text(body["next_steps"]) if "next_steps" in body else None,
            confirm_applied=bool(body.get("confirm_applied", False)),
        )
        resp = make_response(jsonify({"opportunity": updated}))
        return _attach_session_cookies(resp, uid, is_new)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404


@employability_bp.post("/api/employability/opportunities/<opp_id>/generate-cv")
def generate_opportunity_cv(opp_id: str):
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    body = request.get_json(silent=True) or {}
    try:
        out = run_opportunity_cv_pipeline(
            _emp_store,
            uid,
            opp_id,
            language=str(body.get("language") or "pt"),
            purpose=str(body.get("purpose") or "job_tailored"),
        )
        resp = make_response(jsonify(out))
        return _attach_session_cookies(resp, uid, is_new)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404


@employability_bp.route("/api/employability/versions", methods=["GET", "POST"])
def opportunity_versions():
    uid, is_new = _get_or_create_uid()
    if request.method == "GET":
        opp_id = request.args.get("opportunity_id")
        resp = make_response(jsonify({"versions": _emp_store.list_cv_versions(uid, opp_id)}))
        return _attach_session_cookies(resp, uid, is_new)

    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    body = request.get_json(silent=True) or {}
    action = str(body.get("action") or "")
    vid = str(body.get("version_id") or "")
    rec = _emp_store.get_cv_version(uid, vid)
    if not rec:
        return jsonify({"error": "Versão não encontrada para este usuário."}), 404

    if action == "duplicate":
        dup = _emp_store.save_opportunity_cv_version(
            uid,
            opportunity_id=rec["opportunity_id"],
            company=rec["company"],
            role=rec["role"],
            content_text=rec["content_text"],
            structured=rec["structured"],
            ats_score=rec["ats_score"],
            ats_report=rec["ats_report"],
            skills_gap=rec["skills_gap"],
            status=rec["status"],
            changelog=[*rec["changelog"], f"Duplicado a partir da versão v{rec['version_num']}."],
        )
        return _attach_session_cookies(make_response(jsonify({"version": dup})), uid, is_new)

    if action == "restore":
        rest = _emp_store.save_opportunity_cv_version(
            uid,
            opportunity_id=rec["opportunity_id"],
            company=rec["company"],
            role=rec["role"],
            content_text=rec["content_text"],
            structured=rec["structured"],
            ats_score=rec["ats_score"],
            ats_report=rec["ats_report"],
            skills_gap=rec["skills_gap"],
            status=rec["status"],
            changelog=[*rec["changelog"], f"Restaurado da versão v{rec['version_num']}."],
        )
        return _attach_session_cookies(make_response(jsonify({"version": rest})), uid, is_new)

    if action == "propagate":
        # Propaga atualizações do Perfil Mestre criando NOVA versão (nunca sobrescreve a histórica)
        out = run_opportunity_cv_pipeline(_emp_store, uid, rec["opportunity_id"])
        return _attach_session_cookies(make_response(jsonify({"version": out["version"]})), uid, is_new)

    if action == "export":
        fmt = str(body.get("format") or "pdf").lower()
        if fmt == "docx":
            return Response(
                _cv_builder.export_docx_bytes(rec["content_text"]),
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="cv_v{rec["version_num"]}.docx"'},
            )
        return Response(
            _cv_builder.export_pdf_bytes(rec["content_text"]),
            mimetype="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cv_v{rec["version_num"]}.pdf"'},
        )

    return jsonify({"error": "Ação inválida. Use duplicate, restore, propagate ou export."}), 400


@employability_bp.get("/api/employability/dashboard")
def employability_dashboard():
    uid, is_new = _get_or_create_uid()
    filters = {
        "company": request.args.get("company", ""),
        "title": request.args.get("title", ""),
        "area": request.args.get("area", ""),
        "status": request.args.get("status", ""),
        "location": request.args.get("location", ""),
    }
    data = build_dashboard_and_learning(_emp_store, uid, filters=filters)
    resp = make_response(jsonify(data))
    return _attach_session_cookies(resp, uid, is_new)


@employability_bp.delete("/api/employability/history")
def clear_employability_history():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    _emp_store.clear_history(uid)
    resp = make_response(jsonify({"cleared": True}))
    return _attach_session_cookies(resp, uid, is_new)
