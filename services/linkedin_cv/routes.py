from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Any

from flask import Blueprint, Response, g, jsonify, make_response, redirect, request

from services.linkedin_cv.ats_engine import build_multilingual_ats_cv, validate_generated_document
from services.linkedin_cv.oauth_service import LinkedinApiClient, LinkedinOAuthService
from services.linkedin_cv.profile_and_cv import (
    CV_TEMPLATES,
    CvBuilderService,
    CvOptimizationEngine,
    LinkedinDataNormalizer,
)
from services.linkedin_cv.security_store import LinkedinPrivacyStore

linkedin_cv_bp = Blueprint("linkedin_cv", __name__)

_store = LinkedinPrivacyStore(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "security_logs", "linkedin_cv.db"))
_oauth = LinkedinOAuthService(_store)
_api_client = LinkedinApiClient()
_normalizer = LinkedinDataNormalizer()
_optimizer = CvOptimizationEngine()
_cv_builder = CvBuilderService()


def _session_secret() -> bytes:
    raw = os.environ.get("FLASK_SECRET_KEY") or os.environ.get("SECURITY_API_TOKEN") or "vagapulse-dev-session-key"
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _sign_uid(uid: str) -> str:
    sig = hmac.new(_session_secret(), uid.encode("utf-8"), hashlib.sha256).hexdigest()[:24]
    return f"{uid}.{sig}"


def _verify_uid(cookie_val: str) -> str | None:
    if not cookie_val or "." not in cookie_val:
        return None
    uid, sig = cookie_val.rsplit(".", 1)
    expected = hmac.new(_session_secret(), uid.encode("utf-8"), hashlib.sha256).hexdigest()[:24]
    return uid if hmac.compare_digest(sig, expected) else None


def _get_or_create_uid() -> tuple[str, bool]:
    existing = _verify_uid(request.cookies.get("vp_uid", ""))
    if existing:
        return existing, False
    return f"usr-{secrets.token_hex(8)}", True


def _csrf_ok() -> bool:
    cookie_tok = request.cookies.get("vp_csrf", "")
    hdr_tok = request.headers.get("X-CSRF-Token", "")
    if cookie_tok and hdr_tok and hmac.compare_digest(cookie_tok, hdr_tok):
        return True
    # Permite chamadas same-origin explícitas com X-Requested-With quando cookie CSRF ainda não foi emitido em testes
    if request.headers.get("X-Requested-With") == "XMLHttpRequest" and not cookie_tok:
        return True
    return False


def _attach_session_cookies(resp: Response, uid: str, is_new_uid: bool, csrf_token: str | None = None) -> Response:
    is_https = request.is_secure or request.headers.get("X-Forwarded-Proto", "") == "https"
    if is_new_uid:
        resp.set_cookie("vp_uid", _sign_uid(uid), httponly=True, samesite="Lax", secure=is_https, max_age=86400 * 30)
    if not request.cookies.get("vp_csrf"):
        resp.set_cookie("vp_csrf", csrf_token or secrets.token_urlsafe(24), httponly=False, samesite="Lax", secure=is_https, max_age=86400 * 30)
    return resp


@linkedin_cv_bp.get("/api/linkedin/config")
def linkedin_config():
    uid, is_new = _get_or_create_uid()
    cfg = _oauth.get_client_config()
    csrf_val = request.cookies.get("vp_csrf") or secrets.token_urlsafe(24)
    resp = make_response(
        jsonify(
            {
                "configured": cfg["configured"],
                "scopes": cfg["scopes"],
                "consent_metadata": _oauth.get_consent_metadata(),
                "connection": _store.get_connection_status(uid),
                "consents": _store.get_consents(uid),
                "templates": CV_TEMPLATES,
                "csrf_token": csrf_val,
            }
        )
    )
    return _attach_session_cookies(resp, uid, is_new, csrf_val)


@linkedin_cv_bp.get("/api/linkedin/status")
def linkedin_status():
    uid, is_new = _get_or_create_uid()
    resp = make_response(
        jsonify(
            {
                "connection": _store.get_connection_status(uid),
                "consents": _store.get_consents(uid),
                "audit_log": _store.get_audit_log(uid, 20),
            }
        )
    )
    return _attach_session_cookies(resp, uid, is_new)


@linkedin_cv_bp.post("/api/linkedin/oauth/start")
def linkedin_oauth_start():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    body = request.get_json(silent=True) or {}
    consents = body.get("consents") or {}
    redirect_uri = body.get("redirect_uri")
    try:
        out = _oauth.start_authorization(uid, consents, redirect_uri)
        resp = make_response(jsonify(out))
        return _attach_session_cookies(resp, uid, is_new)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc), "code": "LINKEDIN_NOT_CONFIGURED"}), 503


@linkedin_cv_bp.get("/api/linkedin/oauth/callback")
def linkedin_oauth_callback():
    uid = _verify_uid(request.cookies.get("vp_uid", ""))
    if not uid:
        return jsonify({"error": "Sessão inválida ou expirada (Session Fixation/CSRF bloqueado)."}), 403
    code = request.args.get("code", "")
    state = request.args.get("state", "")
    err = request.args.get("error", "")
    try:
        conn = _oauth.handle_callback(uid, code=code, state=state, error=err)
        token = _store.get_decrypted_access_token(uid)
        if token and _store.get_consents(uid).get("B_import_profile", {}).get("granted"):
            try:
                li_profile = _api_client.fetch_authorized_profile(token)
                existing = _store.get_profile(uid) or {}
                normalized = _normalizer.normalize(linkedin_data=li_profile, manual_data=existing.get("manual_snapshot"))
                _store.save_profile(uid, normalized)
            except Exception as sync_exc:
                _store.log_audit(uid, "linkedin_sync_warning", f"Conectado, porém falha parcial na importação: {type(sync_exc).__name__}")
        if "text/html" in request.headers.get("Accept", ""):
            return redirect("/?linkedin=connected")
        return jsonify({"connected": True, "connection": conn})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@linkedin_cv_bp.post("/api/linkedin/sync")
def linkedin_sync():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    consents = _store.get_consents(uid)
    if not consents.get("B_import_profile", {}).get("granted"):
        return jsonify({"error": "Consentimento B (Importação de perfil) não concedido ou revogado."}), 403
    token = _store.get_decrypted_access_token(uid)
    if not token:
        return jsonify({"error": "Token ausente ou expirado. Reconecte sua conta LinkedIn."}), 401
    try:
        li_profile = _api_client.fetch_authorized_profile(token)
        existing = _store.get_profile(uid) or {}
        normalized = _normalizer.normalize(linkedin_data=li_profile, manual_data=existing.get("manual_snapshot"))
        _store.save_profile(uid, normalized)
        resp = make_response(jsonify({"synced": True, "profile": normalized}))
        return _attach_session_cookies(resp, uid, is_new)
    except PermissionError as exc:
        return jsonify({"error": str(exc), "needs_reauth": True}), 401
    except Exception as exc:
        return jsonify({"error": f"Falha ao sincronizar com LinkedIn: {type(exc).__name__}"}), 502


@linkedin_cv_bp.post("/api/linkedin/disconnect")
def linkedin_disconnect():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    _store.disconnect(uid)
    resp = make_response(jsonify({"disconnected": True, "connection": _store.get_connection_status(uid)}))
    return _attach_session_cookies(resp, uid, is_new)


@linkedin_cv_bp.route("/api/linkedin/privacy", methods=["GET", "POST", "DELETE"])
def linkedin_privacy():
    uid, is_new = _get_or_create_uid()
    if request.method == "GET":
        resp = make_response(
            jsonify(
                {
                    "consents": _store.get_consents(uid),
                    "profile": _store.get_profile(uid),
                    "cv_versions": _store.list_cv_versions(uid),
                    "audit_log": _store.get_audit_log(uid, 50),
                }
            )
        )
        return _attach_session_cookies(resp, uid, is_new)

    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403

    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        if "consents" in body:
            _store.save_consents(uid, body["consents"])
        resp = make_response(jsonify({"updated": True, "consents": _store.get_consents(uid)}))
        return _attach_session_cookies(resp, uid, is_new)

    _store.erase_all_user_data(uid)
    resp = make_response(jsonify({"erased": True}))
    return _attach_session_cookies(resp, uid, is_new)


@linkedin_cv_bp.route("/api/cv/profile", methods=["GET", "POST"])
def cv_profile():
    uid, is_new = _get_or_create_uid()
    if request.method == "GET":
        prof = _store.get_profile(uid)
        analysis = _optimizer.analyze_profile(prof) if prof else None
        resp = make_response(jsonify({"profile": prof, "analysis": analysis}))
        return _attach_session_cookies(resp, uid, is_new)

    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    body = request.get_json(silent=True) or {}
    manual_data = body.get("manual_data") or body
    resume_text = str(body.get("resume_text") or "")
    existing = _store.get_profile(uid) or {}
    li_data = {
        "name": (existing.get("name") or {}).get("value") if (existing.get("name") or {}).get("origin") == "linkedin_api" else None,
        "email": (existing.get("email") or {}).get("value") if (existing.get("email") or {}).get("origin") == "linkedin_api" else None,
    }
    normalized = _normalizer.normalize(linkedin_data=li_data, manual_data=manual_data, resume_text=resume_text)
    normalized["manual_snapshot"] = manual_data
    _store.save_profile(uid, normalized)
    analysis = _optimizer.analyze_profile(normalized)
    resp = make_response(jsonify({"profile": normalized, "analysis": analysis}))
    return _attach_session_cookies(resp, uid, is_new)


@linkedin_cv_bp.post("/api/cv/generate")
def cv_generate():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    uid, is_new = _get_or_create_uid()
    body = request.get_json(silent=True) or {}
    prof = body.get("profile") or _store.get_profile(uid)
    if not prof:
        prof = _normalizer.normalize(manual_data=body.get("manual_data") or {}, resume_text=str(body.get("resume_text") or ""))
    template_key = str(body.get("template") or "complete")
    language = str(body.get("language") or "pt")
    visual_style = str(body.get("visual_style") or "ats_professional")
    job_context = body.get("job_context") if isinstance(body.get("job_context"), dict) else None
    built_legacy = _cv_builder.build_cv_text(prof, template_key=template_key, job_context=job_context)
    built_v2 = build_multilingual_ats_cv(
        prof,
        purpose=template_key,
        language=language,
        visual_style=visual_style,
        job_text=str((job_context or {}).get("description") or ""),
        job_title=str((job_context or {}).get("title") or ""),
    )
    pdf_bytes = _cv_builder.export_pdf_bytes(built_v2["content_text"])
    docx_bytes = _cv_builder.export_docx_bytes(built_v2["content_text"])
    doc_validation = validate_generated_document(pdf_bytes=pdf_bytes, docx_bytes=docx_bytes)

    built = {
        **built_legacy,
        **built_v2,
        "document_validation": doc_validation,
    }
    version = _store.save_cv_version(
        user_id=uid,
        version_type="job_tailored" if job_context else "updated",
        title=f"{built['template_label']} ({language.upper()})" + (f" ({job_context.get('title')})" if job_context and job_context.get("title") else ""),
        content_text=built["content_text"],
        structured=built,
        created_by=str(body.get("created_by") or "user_with_ai"),
        job_id=job_context.get("id") if job_context else None,
    )
    resp = make_response(jsonify({"generated": built, "version": version}))
    return _attach_session_cookies(resp, uid, is_new)


@linkedin_cv_bp.post("/api/cv/export")
def cv_export():
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    body = request.get_json(silent=True) or {}
    text = str(body.get("content_text") or "").strip()
    fmt = str(body.get("format") or "pdf").lower()
    if not text:
        return jsonify({"error": "Texto do currículo vazio para exportação."}), 400
    if fmt == "txt":
        return Response(
            text.encode("utf-8"),
            mimetype="text/plain; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="curriculo_vagapulse_ats.txt"'},
        )
    if fmt == "json":
        import json as _json
        payload = _json.dumps(body.get("structured_json") or {"content_text": text}, ensure_ascii=False, indent=2)
        return Response(
            payload.encode("utf-8"),
            mimetype="application/json; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="curriculo_vagapulse_ats.json"'},
        )
    if fmt == "docx":
        data = _cv_builder.export_docx_bytes(text)
        return Response(
            data,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": 'attachment; filename="curriculo_vagapulse_ats.docx"'},
        )
    data = _cv_builder.export_pdf_bytes(text)
    return Response(
        data,
        mimetype="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="curriculo_vagapulse_ats.pdf"'},
    )


@linkedin_cv_bp.route("/api/cv/versions", methods=["GET", "POST", "DELETE"])
def cv_versions():
    uid, is_new = _get_or_create_uid()
    if request.method == "GET":
        resp = make_response(jsonify({"versions": _store.list_cv_versions(uid)}))
        return _attach_session_cookies(resp, uid, is_new)
    if not _csrf_ok():
        return jsonify({"error": "Falha na validação CSRF."}), 403
    if request.method == "DELETE":
        _store.clear_cv_versions(uid)
        resp = make_response(jsonify({"cleared": True}))
        return _attach_session_cookies(resp, uid, is_new)
    body = request.get_json(silent=True) or {}
    vid = str(body.get("restore_version_id") or "")
    rec = _store.get_cv_version(uid, vid)
    if not rec:
        return jsonify({"error": "Versão não encontrada para esta conta."}), 404
    restored = _store.save_cv_version(
        user_id=uid,
        version_type="restored",
        title=f"Restaurada: {rec['title']}",
        content_text=rec["content_text"],
        structured={},
        created_by="user_restore",
        job_id=rec.get("job_id"),
    )
    resp = make_response(jsonify({"restored": restored}))
    return _attach_session_cookies(resp, uid, is_new)
