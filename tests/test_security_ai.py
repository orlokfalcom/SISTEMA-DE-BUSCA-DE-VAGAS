import json
import tempfile
import unittest
from pathlib import Path

from app import app
from services.security_ai import AutonomousSecurityAI


class AutonomousSecurityAITestCase(unittest.TestCase):
    def test_detects_sqli_xss_and_saves_documents(self):
        with tempfile.TemporaryDirectory() as tmp:
            ai = AutonomousSecurityAI(log_dir=tmp)
            verdict = ai.analyze_payload(
                ip="192.0.2.55",
                method="GET",
                path="/api/search",
                query_string="q=' OR 1=1; DROP TABLE users;-- <script>alert(1)</script>",
                headers={"User-Agent": "sqlmap/1.7"},
            )
            self.assertTrue(verdict["blocked"])
            self.assertGreaterEqual(verdict["risk_score"], 80)
            self.assertTrue(Path(tmp, "intrusion_attempts.jsonl").exists())
            self.assertTrue(Path(tmp, "RELATORIO_INVASOES.md").exists())

            lines = Path(tmp, "intrusion_attempts.jsonl").read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 1)
            rec = json.loads(lines[0])
            self.assertEqual(rec["action_taken"], "BLOQUEADO (403)")

            md = Path(tmp, "RELATORIO_INVASOES.md").read_text(encoding="utf-8")
            self.assertIn("Relatório Autônomo de Segurança", md)
            self.assertIn("192.0.2.55", md)

    def test_flask_blocks_intrusion_and_logs_unauthorized_access(self):
        client = app.test_client()
        resp = client.get(
            "/api/search?q=<script>alert(1)</script> UNION SELECT password FROM users",
            environ_base={"REMOTE_ADDR": "203.0.113.42"},
        )
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertIn("bloqueado", data["error"].lower())

        # Acesso não autorizado via IP externo simulado em /api/security/report
        unauth = client.get("/api/security/report", environ_base={"REMOTE_ADDR": "198.51.100.99"})
        self.assertEqual(unauth.status_code, 403)

        # Acesso autorizado local retorna o resumo com os documentos salvos
        auth = client.get("/api/security/report", environ_base={"REMOTE_ADDR": "127.0.0.1"})
        self.assertEqual(auth.status_code, 200)
        summary = auth.get_json()
        self.assertGreaterEqual(summary["total_incidents"], 1)
        self.assertTrue(Path(summary["report_path"]).exists())


if __name__ == "__main__":
    unittest.main()
