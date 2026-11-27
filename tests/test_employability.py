import io
import unittest
import zipfile

from app import app
from services.employability.ats_simulator import simulate_ats_reading
from services.employability.skills_gap_engine import analyze_skills_gap
from services.linkedin_cv.profile_and_cv import CvBuilderService


def _make_problematic_docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        zf.writestr("word/header1.xml", "<w:hdr xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:p><w:r><w:t>email@header.com</w:t></w:r></w:p></w:hdr>")
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>JOAO SILVA</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
            "<w:p><w:r><w:t>Python SQL</w:t></w:r></w:p><w:drawing/></w:body></w:document>",
        )
    return buf.getvalue()


class EmployabilityAITestCase(unittest.TestCase):
    def test_ats_simulator_pdf_docx_and_problem_detection(self):
        builder = CvBuilderService()
        clean_text = "MARIANA SILVA\nmariana@example.com\n\nRESUMO PROFISSIONAL\nEngenheira Python e SQL.\n\nCOMPETÊNCIAS TÉCNICAS\nPython · SQL · AWS\n\nEXPERIÊNCIA PROFISSIONAL\n- Desenvolveu APIs Python na AWS."
        pdf_bytes = builder.export_pdf_bytes(clean_text)
        rep_pdf = simulate_ats_reading(file_bytes=pdf_bytes, filename="cv.pdf", job_description="Obrigatório: Python, AWS")
        self.assertEqual(rep_pdf["file_format"], "pdf")
        self.assertGreaterEqual(rep_pdf["extraction_pct"], 70)
        self.assertEqual(rep_pdf["job_compatibility"]["score"], 100)

        bad_docx = _make_problematic_docx()
        rep_docx = simulate_ats_reading(file_bytes=bad_docx, filename="bad.docx")
        self.assertEqual(rep_docx["file_format"], "docx")
        joined_issues = " ".join(rep_docx["structural_issues"])
        self.assertIn("Tabelas detectadas", joined_issues)
        self.assertIn("Cabeçalhos/rodapés", joined_issues)
        self.assertIn("Elementos gráficos", joined_issues)

    def test_skills_gap_matrix_mandatory_alert_and_plan(self):
        master = {
            "technical_skills": ["Python", "PostgreSQL"],
            "experiences": [{"role": "Dev", "responsibilities": "APIs em Python e PostgreSQL"}],
            "education": ["Bacharelado em Ciência da Computação"],
            "languages": ["Português", "Inglês B2"],
        }
        job_desc = "Obrigatório: Python, Kubernetes, SIEM.\nDesejável: AWS, MySQL."
        gap = analyze_skills_gap(master, job_desc, "Engenheiro DevSecOps")
        self.assertTrue(gap["mandatory_alert"])
        self.assertIn("Kubernetes", gap["unmet_mandatory_requirements"])
        self.assertGreaterEqual(len(gap["unmet_mandatory_requirements"]), 2)
        self.assertTrue(any(m["skill"] == "MySQL" and m["status"] == "Parcial" for m in gap["competency_matrix"]))
        self.assertTrue(any(d["priority"] == "Prioridade crítica" for d in gap["development_plan"]))

    def test_end_to_end_pipeline_versioning_tracker_learning_and_security(self):
        client_a = app.test_client()
        client_b = app.test_client()

        cfg_a = client_a.get("/api/linkedin/config").get_json()
        hdr_a = {"X-CSRF-Token": cfg_a["csrf_token"]}
        cfg_b = client_b.get("/api/linkedin/config").get_json()
        hdr_b = {"X-CSRF-Token": cfg_b["csrf_token"]}

        # 1. Bloqueio de arquivo malicioso (MZ/PE) no simulador
        mal_resp = client_a.post(
            "/api/employability/ats-simulate",
            data={"file": (io.BytesIO(b"MZ\x90\x00evil"), "evil.pdf")},
            content_type="multipart/form-data",
            headers=hdr_a,
        )
        self.assertEqual(mal_resp.status_code, 400)

        # 2. Cadastra Perfil Mestre -> Oportunidade -> Gera CV Versionado
        client_a.post(
            "/api/employability/master-profile",
            json={
                "name": "Rafael Costa",
                "email": "rafael@example.com",
                "technical_skills": ["Python", "SQL", "Docker"],
                "experiences": [{"role": "Engenheiro de Dados", "company": "DataX", "start_date": "2023-01", "responsibilities": "Pipelines Python e SQL"}],
                "education": ["Engenharia de Software"],
            },
            headers=hdr_a,
        )
        opp = client_a.post(
            "/api/employability/opportunities",
            json={"company": "CloudCorp", "title": "Data Engineer", "area": "Dados", "description": "Obrigatório: Python, SQL, AWS"},
            headers=hdr_a,
        ).get_json()["opportunity"]

        gen = client_a.post(f"/api/employability/opportunities/{opp['id']}/generate-cv", json={"language": "pt"}, headers=hdr_a)
        self.assertEqual(gen.status_code, 200)
        vid1 = gen.get_json()["version"]["id"]
        self.assertEqual(gen.get_json()["opportunity"]["status"], "Currículo preparado")

        # 3. Duplica e propaga atualização sem sobrescrever v1
        dup = client_a.post("/api/employability/versions", json={"action": "duplicate", "version_id": vid1}, headers=hdr_a)
        self.assertEqual(dup.status_code, 200)
        self.assertEqual(dup.get_json()["version"]["version_num"], 2)

        # 4. Isolamento entre usuários (Usuário B não acessa versão do Usuário A)
        iso = client_b.post("/api/employability/versions", json={"action": "restore", "version_id": vid1}, headers=hdr_b)
        self.assertEqual(iso.status_code, 404)

        # 5. Tracker exige confirm_applied=True para "Candidatura enviada"
        fail_apply = client_a.post(
            f"/api/employability/opportunities/{opp['id']}/status",
            json={"status": "Candidatura enviada"},
            headers=hdr_a,
        )
        self.assertEqual(fail_apply.status_code, 400)

        ok_apply = client_a.post(
            f"/api/employability/opportunities/{opp['id']}/status",
            json={"status": "Candidatura enviada", "confirm_applied": True, "notes": "Enviado via portal"},
            headers=hdr_a,
        )
        self.assertEqual(ok_apply.status_code, 200)
        client_a.post(
            f"/api/employability/opportunities/{opp['id']}/status",
            json={"status": "Entrevista"},
            headers=hdr_a,
        )

        # 6. Dashboard & Aprendizado Histórico
        dash = client_a.get("/api/employability/dashboard").get_json()
        self.assertGreaterEqual(dash["kpis"]["total_opportunities"], 1)
        self.assertGreaterEqual(dash["kpis"]["interviews"], 1)
        self.assertGreater(dash["learning_insights"]["interview_rate_pct"], 0)
