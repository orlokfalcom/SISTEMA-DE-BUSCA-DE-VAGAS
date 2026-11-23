from __future__ import annotations

import io
import unittest

from app import app
from services.job_matcher import compute_skill_gap_analytics, match_jobs, parse_salary_value
from services.job_sources import load_local_jobs
from services.resume_parser import (
    detect_education,
    detect_seniority,
    estimate_experience_years,
    extract_skills,
    generate_sample_resume_pdf,
    parse_resume_pdf,
)


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

    def test_search_rejects_invalid_min_score_and_non_list_skills(self):
        resp_min = self.client.post(
            "/api/search",
            json={"skills": ["Python"], "min_score": "abc", "include_live": False},
        )
        self.assertEqual(resp_min.status_code, 400)

        resp_skills = self.client.post(
            "/api/search",
            json={"skills": "Python", "include_live": False},
        )
        self.assertEqual(resp_skills.status_code, 400)

    def test_parse_salary_value_supports_international_and_k_formats(self):
        self.assertEqual(parse_salary_value("R$ 9.500 - R$ 13.000"), 13000)
        self.assertEqual(parse_salary_value("$80,000 - $120,000"), 120000)
        self.assertEqual(parse_salary_value("$170k - $200k"), 200000)
        self.assertEqual(parse_salary_value("$3.5k–$5k/month"), 5000)
        self.assertEqual(parse_salary_value("70K-80K"), 80000)

    def test_sort_recent_prioritizes_iso_dates_over_generic_labels(self):
        jobs = [
            {"id": "a", "title": "Dev A", "company": "A", "skills": ["Python"], "posted_at": "Recente"},
            {"id": "b", "title": "Dev B", "company": "B", "skills": ["Python"], "posted_at": "2026-11-22"},
            {"id": "c", "title": "Dev C", "company": "C", "skills": ["Python"], "posted_at": "2026-11-20"},
        ]
        ranked = match_jobs(jobs=jobs, candidate_skills=["Python"], sort_by="recent")
        self.assertEqual([j["id"] for j in ranked], ["b", "c", "a"])

    def test_compare_custom_job_infers_real_seniority(self):
        resp = self.client.post(
            "/api/compare-job",
            json={
                "job_title": "Estágio em Python",
                "job_description": "Vaga de estágio para estudantes de TI com conhecimentos em Python e SQL.",
                "skills": ["Python", "SQL"],
                "seniority": "Sênior",
                "resume_text": "Profissional Sênior com 20 anos de experiência em Python e SQL.",
            },
        )
        self.assertEqual(resp.status_code, 200)
        comp = resp.get_json()["comparison"]
        self.assertEqual(comp["seniority"], "Estágio / Trainee")
        self.assertLess(comp["score_breakdown"]["seniority"], 50)

    def test_parser_accuracy_for_cybersecurity_cst_and_edge_cases(self):
        # CST ADS sem a palavra "engenharia" deve detectar Ensino Superior
        self.assertIn(
            "Ensino Superior",
            detect_education("Curso Superior de Tecnologia em Análise e Desenvolvimento de Sistemas (CST ADS) - UNINTER 2027"),
        )
        # "Engenharia de prompts" sozinha não deve gerar falso positivo de Ensino Superior
        self.assertEqual(detect_education("Experiência com IA generativa e engenharia de prompts."), [])

        # Não confundir idade da empresa com experiência do candidato
        years = estimate_experience_years("Empresa com 35 anos de mercado. Desenvolvedor (2024 - 2026).")
        self.assertEqual(years, 2)

        # Capturar "trajetória superior a 20 anos" mesmo com quebra de linha e acento NFD
        self.assertEqual(estimate_experience_years("Profissional de TI com trajeto\u0301ria\nsuperior a 20 anos em ambientes de tecnologia."), 20)

        # Capturar data mais antiga registrada (ex: 01/1992) sempre até a data atual
        exp_old = (
            "EXPERIÊNCIA PROFISSIONAL\n"
            "Professor de Tecnologia | SEE-MG | 03/2021 - Atual\n"
            "Técnico em Informática | Empresa Antiga | 01/1992 - 12/1999\n"
            "FORMAÇÃO ACADÊMICA\n"
            "CST ADS (2023 - 2027)\n"
        )
        self.assertGreaterEqual(estimate_experience_years(exp_old), 34)

        # Sênior com 20 anos que orienta estágio não deve ser classificado como estagiário
        self.assertEqual(
            detect_seniority("Professor com 20 anos de experiência. Orientação de estágio para alunos.", 20),
            "Sênior",
        )

        # Skills de Cibersegurança, Threat Hunting/YARA, SQLite, Streamlit e DevOps
        skills = extract_skills("Cyber Security Engineer com Threat Hunting, YARA, Rust, Python, SQLite, Streamlit e DevOps.")
        for expected in ("Segurança da Informação", "Threat Hunting / YARA", "Rust", "Python", "SQLite", "Streamlit", "DevOps"):
            self.assertIn(expected, skills)

    def test_deep_search_terms_and_external_links(self):
        from services.job_sources import _build_deep_search_terms, build_external_search_links

        terms = _build_deep_search_terms(
            skills=["Python", "Segurança da Informação", "Threat Hunting / YARA", "Rust"],
            suggested_roles=["Engenheiro / Analista de Cibersegurança"],
            primary_skill="Python",
        )
        self.assertIn("Python", terms)
        self.assertIn("security", terms)
        self.assertIn("cybersecurity", terms)

        links = build_external_search_links(["Python", "Rust", "SQL"], ["Cientista de Dados / IA", "Engenheiro / Analista de Cibersegurança"])
        portals = [l["portal"] for l in links]
        self.assertIn("Google Jobs (Busca Profunda)", portals)
        self.assertGreaterEqual(len(links), 8)

    def test_improve_resume_endpoint_returns_ats_modifications_and_template(self):
        resp = self.client.post(
            "/api/improve-resume",
            json={
                "resume_text": (
                    "RONALDO COUTINHO\n"
                    "Belo Horizonte - MG | [31984359511 | ronaldolcoutinho75@gmail.com\n"
                    "RESUMO PROFISSIONAL\n"
                    "Profissional de TI com trajetória superior a 20 anos.\n"
                    "EXPERIÊNCIA PROFISSIONAL\n"
                    "Professor | [Inserir mês/ano de início] – Atual\n"
                    "Atuação em projetos de tecnologia e dados.\n"
                    "FORMAÇÃO ACADÊMICA\n"
                    "• • Análise, levantamento e modelagem de requisitos.\n"
                ),
                "pages": 2,
                "word_count": 640,
                "skills": ["Python", "SQL", "Rust", "Segurança da Informação", "Threat Hunting / YARA", "Pandas"],
                "seniority": "Sênior",
                "email": "ronaldolcoutinho75@gmail.com",
                "phone": "31984359511",
                "linkedin": "linkedin.com/in/ronaldocoutinhosa",
                "github": "github.com/orlokfalcom",
                "skill_gaps": [{"skill": "AWS", "demand_count": 5, "demand_pct": 42}],
            },
        )
        self.assertEqual(resp.status_code, 200)
        plan = resp.get_json()["improvement_plan"]
        categories = [m["category"] for m in plan["modifications"]]
        self.assertIn("Campos de Modelo / Placeholders", categories)
        self.assertIn("Formatação & Limpeza ATS", categories)
        self.assertIn("Resultados Mensuráveis & Verbos de Ação", categories)
        self.assertGreater(plan["projected_score"], plan["current_score"])
        self.assertIn("RESUMO PROFISSIONAL", plan["ats_template"])

    def test_country_detection_and_geo_priority_without_excluding_global(self):
        from services.resume_parser import detect_country

        self.assertEqual(detect_country("Belo Horizonte - MG | +55 31 98435-9511"), "Brasil")
        self.assertEqual(detect_country("Lisboa, Portugal | +351 912345678"), "Portugal")

        jobs = [
            {
                "id": "intl-1",
                "title": "Senior Security Engineer",
                "company": "EuroCorp",
                "location": "Berlin, Germany",
                "modality": "Presencial",
                "seniority": "Sênior",
                "skills": ["Python", "Rust", "Segurança da Informação"],
                "description": "Security engineering with Python and Rust.",
                "source": "Carreira Direta (EuroCorp)",
            },
            {
                "id": "br-company-1",
                "title": "Senior Security Engineer",
                "company": "EmpresaBR",
                "location": "São Paulo, Brazil",
                "modality": "Remoto",
                "seniority": "Sênior",
                "skills": ["Python", "Rust", "Segurança da Informação"],
                "description": "Security engineering with Python and Rust.",
                "source": "Carreira Direta (EmpresaBR)",
                "company_origin": "Brasil",
            },
        ]
        ranked = match_jobs(
            jobs=jobs,
            candidate_skills=["Python", "Rust", "Segurança da Informação"],
            candidate_seniority="Sênior",
            user_country="Brasil",
        )
        # Prioriza a empresa do país do usuário, mas mantém a internacional nos resultados
        self.assertEqual(len(ranked), 2)
        self.assertEqual(ranked[0]["id"], "br-company-1")
        self.assertEqual(ranked[0]["geo_scope"], "local_country")
        self.assertEqual(ranked[1]["id"], "intl-1")
        self.assertGreater(ranked[0]["match_score"], ranked[1]["match_score"])

    def test_recommend_courses_uses_skill_gaps_and_roles(self):
        from services.job_matcher import recommend_courses

        courses = recommend_courses(
            skill_gaps=[{"skill": "AWS", "demand_pct": 58}, {"skill": "Docker", "demand_pct": 42}],
            candidate_skills=["Python", "Rust", "Segurança da Informação"],
            suggested_roles=["Engenheiro / Analista de Cibersegurança"],
        )
        self.assertGreaterEqual(len(courses), 3)
        self.assertEqual(courses[0]["target_skill"], "AWS")
        self.assertEqual(courses[1]["target_skill"], "Docker")
        self.assertTrue(all(c["url"].startswith("https://") for c in courses))


if __name__ == "__main__":
    unittest.main()
