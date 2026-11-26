import io
import os
import tempfile
import unittest
import zipfile
from unittest.mock import MagicMock, patch

from app import app
from services.linkedin_cv.oauth_service import LinkedinOAuthService
from services.linkedin_cv.profile_and_cv import CvBuilderService, CvOptimizationEngine, LinkedinDataNormalizer
from services.linkedin_cv.security_store import LinkedinPrivacyStore, LinkedinTokenManager


class LinkedinCvBuilderTestCase(unittest.TestCase):
    def test_token_encryption_rotation_and_tamper_detection(self):
        with tempfile.TemporaryDirectory() as tmp:
            mgr = LinkedinTokenManager(f"{tmp}/keyring.json")
            blob = mgr.encrypt("secret-li-token-123")
            self.assertEqual(mgr.decrypt(blob), "secret-li-token-123")
            new_kid = mgr.rotate_key()
            blob2 = mgr.encrypt("secret-li-token-456")
            self.assertEqual(blob2["key_id"], new_kid)
            self.assertEqual(mgr.decrypt(blob), "secret-li-token-123")
            self.assertEqual(mgr.decrypt(blob2), "secret-li-token-456")

            tampered = dict(blob2, ciphertext="AAAA")
            with self.assertRaises(ValueError):
                mgr.decrypt(tampered)

    def test_oauth_pkce_flow_and_replay_state_uri_protections(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(
            os.environ,
            {
                "LINKEDIN_CLIENT_ID": "test-client",
                "LINKEDIN_CLIENT_SECRET": "test-secret",
                "LINKEDIN_REDIRECT_URI": "https://app.example/callback",
                "LINKEDIN_ALLOWED_REDIRECT_URIS": "https://app.example/callback",
            },
        ):
            store = LinkedinPrivacyStore(f"{tmp}/test.db")
            oauth = LinkedinOAuthService(store)

            # Rejeita sem consentimento A
            with self.assertRaises(ValueError):
                oauth.start_authorization("usr-1", {"A_connect_account": False})

            # Rejeita redirect_uri não cadastrada (Open Redirect)
            with self.assertRaises(ValueError):
                oauth.start_authorization("usr-1", {"A_connect_account": True}, "https://evil.example/steal")

            start = oauth.start_authorization("usr-1", {"A_connect_account": True, "B_import_profile": True})
            self.assertIn("code_challenge=", start["authorization_url"])
            self.assertIn("code_challenge_method=S256", start["authorization_url"])

            # State inválido
            with self.assertRaises(ValueError):
                oauth.handle_callback("usr-1", code="code-1", state="invalid-state")

            # Fluxo válido (mock troca oficial HTTPS)
            mock_resp = MagicMock(status_code=200)
            mock_resp.json.return_value = {"access_token": "tok-abc", "expires_in": 3600, "scope": "openid profile email"}
            with patch("services.linkedin_cv.oauth_service.requests.post", return_value=mock_resp):
                conn = oauth.handle_callback("usr-1", code="code-valid-1", state=start["state"])
                self.assertTrue(conn["connected"])

            # Replay do mesmo state bloqueado
            with self.assertRaises(ValueError):
                oauth.handle_callback("usr-1", code="code-valid-2", state=start["state"])

            # Replay do mesmo authorization code bloqueado mesmo com novo state
            start2 = oauth.start_authorization("usr-1", {"A_connect_account": True})
            with self.assertRaises(ValueError):
                oauth.handle_callback("usr-1", code="code-valid-1", state=start2["state"])

            # Consentimento negado pelo usuário
            with self.assertRaises(ValueError):
                oauth.handle_callback("usr-1", code="", state=start2["state"], error="access_denied")

    def test_normalizer_ai_optimizer_and_pdf_docx_exports(self):
        norm = LinkedinDataNormalizer()
        profile = norm.normalize(
            linkedin_data={"name": "Mariana Silva", "email": "mariana@example.com", "email_verified": True},
            manual_data={
                "name": "Mariana S.",
                "experiences": [{"role": "Analista", "company": "Tech", "start_date": "2018-01", "end_date": "2019-12", "responsibilities": "APIs em Python e Docker"}],
                "technical_skills": ["SQL", "Kubernetes"],
            },
        )
        self.assertEqual(len(profile["conflicts"]), 1)

        analysis = CvOptimizationEngine().analyze_profile(profile)
        self.assertIn("Python", analysis["skills_in_experience_missing_from_list"])
        self.assertIn("Kubernetes", analysis["declared_skills_without_evidence"])

        builder = CvBuilderService()
        built = builder.build_cv_text(profile, template_key="infosec", job_context={"title": "SecOps", "description": "Python SQL"})
        self.assertIn("MARIANA", built["content_text"])

        pdf_bytes = builder.export_pdf_bytes(built["content_text"])
        self.assertTrue(pdf_bytes.startswith(b"%PDF-1.4"))

        docx_bytes = builder.export_docx_bytes(built["content_text"])
        self.assertTrue(docx_bytes.startswith(b"PK"))
        with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as zf:
            self.assertIn("word/document.xml", zf.namelist())

    def test_flask_endpoints_csrf_isolation_and_lgpd_erasure(self):
        client_a = app.test_client()
        client_b = app.test_client()

        # Config inicial emite cookies HttpOnly + CSRF
        cfg = client_a.get("/api/linkedin/config")
        self.assertEqual(cfg.status_code, 200)
        cfg_json = cfg.get_json()
        self.assertNotIn("client_secret", cfg_json)
        csrf_a = cfg_json["csrf_token"]

        # CSRF sem token/header deve retornar 403
        csrf_fail = client_a.post("/api/cv/profile", json={"name": "Alice"})
        self.assertEqual(csrf_fail.status_code, 403)

        # Cria perfil e versão para usuário A
        hdr_a = {"X-CSRF-Token": csrf_a}
        client_a.post("/api/cv/profile", json={"name": "Alice", "technical_skills": ["Python"]}, headers=hdr_a)
        gen = client_a.post("/api/cv/generate", json={"template": "technical"}, headers=hdr_a)
        self.assertEqual(gen.status_code, 200)
        vid = gen.get_json()["version"]["id"]

        # Isolamento entre contas: Usuário B não consegue restaurar versão do Usuário A
        cfg_b = client_b.get("/api/linkedin/config").get_json()
        iso = client_b.post("/api/cv/versions", json={"restore_version_id": vid}, headers={"X-CSRF-Token": cfg_b["csrf_token"]})
        self.assertEqual(iso.status_code, 404)

        # Exportação PDF e DOCX via HTTP
        pdf_resp = client_a.post("/api/cv/export", json={"content_text": "ALICE\nPython", "format": "pdf"}, headers=hdr_a)
        self.assertEqual(pdf_resp.status_code, 200)
        self.assertTrue(pdf_resp.data.startswith(b"%PDF-1.4"))

        docx_resp = client_a.post("/api/cv/export", json={"content_text": "ALICE\nPython", "format": "docx"}, headers=hdr_a)
        self.assertEqual(docx_resp.status_code, 200)
        self.assertTrue(docx_resp.data.startswith(b"PK"))

        # Exclusão LGPD apaga dados do usuário A
        erase = client_a.delete("/api/linkedin/privacy", headers=hdr_a)
        self.assertEqual(erase.status_code, 200)
        priv = client_a.get("/api/linkedin/privacy").get_json()
        self.assertIsNone(priv["profile"])
        self.assertEqual(priv["cv_versions"], [])
