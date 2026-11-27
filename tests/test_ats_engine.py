import json
import unittest

from app import app
from services.linkedin_cv.ats_engine import (
    analyze_job_description,
    build_multilingual_ats_cv,
    rewrite_experience_text,
    validate_generated_document,
)
from services.linkedin_cv.profile_and_cv import CvBuilderService, LinkedinDataNormalizer


class AtsEngineV2TestCase(unittest.TestCase):
    def test_job_analysis_rewrite_and_multilingual_generation(self):
        job_desc = (
            "Analista de Segurança da Informação Sênior. Mínimo 4 anos de experiência.\n"
            "Obrigatório: Python, SIEM, Gestão de vulnerabilidades.\n"
            "Desejável: AWS, Security+, Inglês."
        )
        analysis = analyze_job_description(job_desc, "Analista de Segurança da Informação")
        self.assertEqual(analysis["professional_area"], "Segurança da Informação")
        self.assertEqual(analysis["seniority"], "Sênior")
        self.assertEqual(analysis["min_experience_years"], 4)
        self.assertIn("Cybersecurity", analysis["keywords"])

        rewritten = rewrite_experience_text("Responsável pelo suporte de computadores.")
        self.assertIn("infraestrutura de TI", rewritten)
        self.assertNotRegex(rewritten, r"\d+%")  # nunca inventa números

        profile = LinkedinDataNormalizer().normalize(
            manual_data={
                "name": "Carlos Mendes",
                "headline": "Analista de Segurança da Informação",
                "email": "carlos@example.com",
                "technical_skills": ["Python", "SIEM", "AWS"],
                "experiences": [{"role": "Analista de TI", "company": "SecCorp", "start_date": "2022-01", "responsibilities": "Responsável pelo suporte de computadores."}],
                "education": ["CST em Segurança da Informação"],
                "languages": ["Português (Nativo)", "Inglês (B2)"],
            }
        )

        builder = CvBuilderService()
        for lang, expected_hdr in [("pt", "RESUMO PROFISSIONAL"), ("en", "PROFESSIONAL SUMMARY"), ("es", "RESUMEN PROFESIONAL"), ("fr", "PROFIL PROFESSIONNEL")]:
            out = build_multilingual_ats_cv(profile, purpose="job_tailored", language=lang, job_text=job_desc, job_title="Analista de Segurança da Informação")
            self.assertIn(expected_hdr, out["content_text"])
            self.assertTrue(out["ats_score"]["is_internal_estimate"])
            pdf_bytes = builder.export_pdf_bytes(out["content_text"])
            docx_bytes = builder.export_docx_bytes(out["content_text"])
            val = validate_generated_document(pdf_bytes=pdf_bytes, docx_bytes=docx_bytes)
            self.assertTrue(val["valid"], f"Falha na validação do documento ({lang}): {val['issues']}")
            self.assertGreater(val["pdf_chars"], 50)
            self.assertGreater(val["docx_chars"], 50)

    def test_flask_cv_generate_and_four_format_exports(self):
        client = app.test_client()
        cfg = client.get("/api/linkedin/config").get_json()
        hdr = {"X-CSRF-Token": cfg["csrf_token"]}

        gen = client.post(
            "/api/cv/generate",
            json={
                "manual_data": {"name": "Ana Lima", "email": "ana@example.com", "technical_skills": ["Python", "SQL", "Docker"]},
                "template": "executive",
                "language": "en",
                "visual_style": "ats_classic",
                "job_context": {"title": "Data Engineer", "description": "Required: Python, SQL, AWS"},
            },
            headers=hdr,
        )
        self.assertEqual(gen.status_code, 200)
        body = gen.get_json()["generated"]
        self.assertTrue(body["document_validation"]["valid"])
        self.assertTrue(body["ats_score"]["is_internal_estimate"])

        for fmt, prefix in [("pdf", b"%PDF-1.4"), ("docx", b"PK"), ("txt", b"ANA LIMA"), ("json", b"{")]:
            exp = client.post(
                "/api/cv/export",
                json={"content_text": body["content_text"], "structured_json": body["structured_json"], "format": fmt},
                headers=hdr,
            )
            self.assertEqual(exp.status_code, 200)
            self.assertTrue(exp.data.startswith(prefix), f"Formato {fmt} inválido")
            if fmt == "json":
                parsed = json.loads(exp.data.decode("utf-8"))
                self.assertEqual(parsed["name"], "Ana Lima")
