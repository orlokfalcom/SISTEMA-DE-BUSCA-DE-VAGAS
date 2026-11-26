from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import requests

from services.linkedin_cv.security_store import CONSENT_PURPOSES, LinkedinPrivacyStore


LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
DEFAULT_SCOPES = ["openid", "profile", "email"]


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def generate_pkce_pair() -> tuple[str, str]:
    verifier = _b64url(secrets.token_bytes(32))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    return verifier, challenge


class LinkedinOAuthService:
    """
    Implementação oficial do OAuth 2.0 Authorization Code Flow + PKCE (S256) para LinkedIn.
    - Nunca coleta senha ou faz scraping.
    - Valida exatamente redirect_uri, state criptográfico single-use e código de autorização único.
    - Nunca expõe client_secret ou tokens ao navegador.
    """

    def __init__(self, store: LinkedinPrivacyStore) -> None:
        self.store = store

    def get_client_config(self) -> dict[str, Any]:
        client_id = os.environ.get("LINKEDIN_CLIENT_ID", "").strip()
        client_secret = os.environ.get("LINKEDIN_CLIENT_SECRET", "").strip()
        redirect_uri = os.environ.get("LINKEDIN_REDIRECT_URI", "").strip()
        allowed_raw = os.environ.get("LINKEDIN_ALLOWED_REDIRECT_URIS", "").strip()
        allowed_uris = [u.strip() for u in allowed_raw.split(",") if u.strip()]
        if redirect_uri and redirect_uri not in allowed_uris:
            allowed_uris.append(redirect_uri)
        scopes = [s.strip() for s in os.environ.get("LINKEDIN_SCOPES", " ".join(DEFAULT_SCOPES)).split() if s.strip()]
        return {
            "configured": bool(client_id and client_secret and redirect_uri),
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "allowed_redirect_uris": allowed_uris,
            "scopes": scopes or DEFAULT_SCOPES,
        }

    def get_consent_metadata(self) -> dict[str, Any]:
        return {
            "purposes": CONSENT_PURPOSES,
            "data_accessed": [
                "Nome completo, foto de perfil e e-mail verificado (via escopos OpenID Connect: openid, profile, email)",
                "Campos profissionais adicionais somente se sua aplicação possuir produto oficial aprovado pelo LinkedIn",
            ],
            "data_not_accessed": [
                "Senha da conta LinkedIn",
                "Mensagens privadas, conexões ocultas ou dados de terceiros",
                "Qualquer dado fora das permissões aprovadas oficialmente",
            ],
            "retention": "Armazenado enquanto sua conta mantiver consentimento ativo; exclusão imediata disponível a qualquer momento.",
        }

    def start_authorization(self, user_id: str, consents: dict[str, bool], requested_redirect_uri: str | None = None) -> dict[str, Any]:
        if not consents.get("A_connect_account"):
            raise ValueError("É necessário confirmar explicitamente o consentimento A (Conexão da conta LinkedIn).")

        cfg = self.get_client_config()
        if not cfg["configured"]:
            raise RuntimeError("LINKEDIN_NOT_CONFIGURED: Defina LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET e LINKEDIN_REDIRECT_URI no ambiente.")

        redirect_uri = (requested_redirect_uri or cfg["redirect_uri"]).strip()
        if redirect_uri not in cfg["allowed_redirect_uris"]:
            raise ValueError("Redirect URI não autorizada na lista de URIs cadastradas.")

        self.store.save_consents(user_id, consents)
        state = _b64url(secrets.token_bytes(24))
        verifier, challenge = generate_pkce_pair()
        self.store.save_oauth_state(state, user_id, verifier, redirect_uri, consents, ttl_seconds=600)

        params = {
            "response_type": "code",
            "client_id": cfg["client_id"],
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": " ".join(cfg["scopes"]),
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return {
            "authorization_url": f"{LINKEDIN_AUTH_URL}?{urlencode(params)}",
            "state": state,
            "scopes": cfg["scopes"],
        }

    def handle_callback(self, user_id: str, code: str, state: str, error: str = "") -> dict[str, Any]:
        if error:
            self.store.log_audit(user_id, "oauth_denied", f"Autorização recusada/erro do provedor: {error}")
            raise ValueError(f"Autorização negada pelo LinkedIn: {error}")
        if not code or not state:
            raise ValueError("Parâmetros 'code' e 'state' são obrigatórios no callback OAuth.")

        state_rec = self.store.consume_oauth_state(state, user_id)
        if not state_rec:
            self.store.log_audit(user_id, "oauth_invalid_state", "Tentativa de callback com state inválido, expirado ou reutilizado.")
            raise ValueError("Parâmetro 'state' inválido, expirado ou já utilizado.")

        if not self.store.mark_auth_code_used(code):
            self.store.log_audit(user_id, "oauth_code_replay", "Tentativa de reutilização de authorization code bloqueada.")
            raise ValueError("Código de autorização já utilizado (replay bloqueado).")

        cfg = self.get_client_config()
        if not cfg["configured"]:
            raise RuntimeError("Credenciais OAuth do LinkedIn não configuradas no servidor.")

        resp = requests.post(
            LINKEDIN_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": state_rec["redirect_uri"],
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "code_verifier": state_rec["code_verifier"],
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        if resp.status_code != 200:
            self.store.log_audit(user_id, "oauth_token_exchange_failed", f"Falha HTTP {resp.status_code} na troca de código.")
            raise ValueError("Falha ao validar código de autorização junto ao LinkedIn.")

        token_data = resp.json()
        access_token = token_data.get("access_token", "")
        if not access_token:
            raise ValueError("Resposta OAuth sem access_token válido.")

        expires_in = int(token_data.get("expires_in", 3600))
        refresh_token = token_data.get("refresh_token", "")
        granted_scopes = str(token_data.get("scope") or " ".join(cfg["scopes"])).replace(",", " ").split()
        unavailable = []
        if "r_fullprofile" not in granted_scopes:
            unavailable.append("r_fullprofile (requer produto oficial aprovado no LinkedIn Developer Portal)")

        self.store.save_tokens(
            user_id=user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            scopes=granted_scopes,
            unavailable_scopes=unavailable,
            expires_at=time.time() + expires_in,
            status="connected",
        )
        return self.store.get_connection_status(user_id)


class LinkedinApiClient:
    """Cliente oficial HTTPS para APIs autorizadas do LinkedIn (nunca usa scraping ou APIs não oficiais)."""

    def fetch_authorized_profile(self, access_token: str) -> dict[str, Any]:
        resp = requests.get(
            LINKEDIN_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            timeout=10,
        )
        if resp.status_code == 401:
            raise PermissionError("TOKEN_EXPIRED_OR_REVOKED")
        if resp.status_code == 403:
            raise PermissionError("INSUFFICIENT_LINKEDIN_PERMISSIONS")
        if resp.status_code == 429:
            raise RuntimeError("LINKEDIN_RATE_LIMIT")
        resp.raise_for_status()
        data = resp.json()
        return {
            "sub": data.get("sub"),
            "name": data.get("name") or f"{data.get('given_name', '')} {data.get('family_name', '')}".strip(),
            "email": data.get("email"),
            "email_verified": bool(data.get("email_verified")),
            "picture": data.get("picture"),
            "locale": data.get("locale"),
            "api_source": "LinkedIn Official OpenID Connect (/v2/userinfo)",
            "unavailable_fields": ["experience", "education", "skills", "certifications"],
        }
