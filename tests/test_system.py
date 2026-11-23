from __future__ import annotations

import io
import unittest

from app import app
from services.job_matcher import compute_skill_gap_analytics, match_jobs
from services.job_sources import load_local_jobs
from services.resume_parser import estimate_experience_years, generate_sample_resume_pdf, parse_resume_pdf


class ResumeJobSearchTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_sample_pdf_parsing_and_ats_audit(self):
        pdf_bytes = generate_sample_resume_pdf()
        profile = parse_resume_pdf(io.BytesIO(pdf_bytes), filename="teste.pdf")

        self.assertEqual(profile.pages, 1)
        self.assertIn("Python", profile.skills)
        self.assertIn("React", profile.skills)
        self.assertIn("PostgreSQL", profile.skills)
        self.assertEqual(profile.seniority, "Pleno")
        self.assertEqual(profile.email, "mariana.silva@exemplo.com.br")
        self.assertIsNotNone(profile.phone)
        self.assertIsNotNone(profile.linkedin)
        self.assertGreaterEqual(profile.ats_audit["score"], 85)
        self.assertEqual(len(profile.ats_audit["checks"]), 5)

    def test_experience_years_ignores_graduation_dates(self):
        text = (
            "EXPERIENCIA PROFISSIONAL\n"
            "Desenvolvedor Backend - Empresa X (2023 - 2026)\n"
            "Atuacao com Python e PostgreSQL.\n"
            "FORMACAO ACADEMICA\n"
            "Bacharelado em Ciencia da Computacao (2017 - 2021)\n"
        )
        years = estimate_experience_years(text)
        self.assertEqual(years, 3)

    def test_rejects_fake_pdf_without_magic_bytes(self):
        resp = self.client.post(
            "/api/analyze",
            data={"file": (io.BytesIO(b"nao sou um pdf de verdade"), "falso.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(resp.status_code, 422)
        self.assertIn("assinatura %PDF", resp.get_json()["error"])

    def test_job_matching_tfidf_breakdown_related_skills_and_sorting(self):
        jobs = load_local_jobs()
        ranked = match_jobs(
            jobs=jobs,
            candidate_skills=["Python", "Django", "React", "TypeScript", "PostgreSQL", "Docker", "AWS"],
            candidate_text="Desenvolvedora Full Stack Python Django React TypeScript PostgreSQL Docker AWS",
            candidate_seniority="Pleno",
            suggested_roles=["Desenvolvedor Full Stack"],
        )

        self.assertTrue(len(ranked) > 10)
        top_job = ranked[0]
        self.assertEqual(top_job["id"], "br-001")
        self.assertGreaterEqual(top_job["match_score"], 75)
        self.assertIn("score_breakdown", top_job)
        self.assertIn("FastAPI", top_job["related_skills"])
        self.assertTrue(len(top_job["pitch_suggestion"]) > 30)

        gaps = compute_skill_gap_analytics(ranked)
        self.assertTrue(len(gaps) >= 1)

        by_salary = match_jobs(
            jobs=jobs,
            candidate_skills=["Python"],
            sort_by="salary",
        )
        self.assertGreaterEqual(by_salary[0]["salary_numeric"], by_salary[1]["salary_numeric"])

    def test_analyze_endpoint_returns_ats_and_skill_gaps(self):
        pdf_bytes = generate_sample_resume_pdf()
        resp = self.client.post(
            "/api/analyze",
            data={
                "file": (io.BytesIO(pdf_bytes), "curriculo.pdf"),
                "include_live": "false",
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("ats_audit", data["profile"])
        self.assertIn("skill_gaps", data)
        self.assertGreater(data["total_jobs"], 0)

    def test_compare_custom_job_endpoint(self):
        resp = self.client.post(
            "/api/compare-job",
            json={
                "job_title": "Engenheiro Backend Python",
                "job_description": "Buscamos dev com Python, FastAPI, Docker, Kubernetes, PostgreSQL e AWS.",
                "skills": ["Python", "Django", "PostgreSQL", "Docker"],
                "seniority": "Pleno",
                "resume_text": "Experiencia com Python, Django, PostgreSQL e Docker.",
            },
        )
        self.assertEqual(resp.status_code, 200)
        comp = resp.get_json()["comparison"]
        self.assertGreaterEqual(comp["match_score"], 50)
        self.assertIn("Python", comp["matched_skills"])
        self.assertIn("FastAPI", comp["related_skills"])
        self.assertTrue(len(comp["optimization_tips"]) >= 1)

    def test_search_endpoint_filters_modality_seniority_and_query(self):
        resp = self.client.post(
            "/api/search",
            json={
                "skills": ["Power BI", "SQL", "Excel"],
                "seniority": "Júnior",
                "source": "local",
                "modality": "Híbrido",
                "job_seniority": "Júnior",
                "query": "Power BI",
                "include_live": False,
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertGreaterEqual(data["total_jobs"], 1)
        for job in data["jobs"]:
            self.assertIn("Híbrido", job["modality"])
            self.assertIn("Júnior", job["seniority"])


if __name__ == "__main__":
    unittest.main()
