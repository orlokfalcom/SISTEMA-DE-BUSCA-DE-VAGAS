import unittest

from app import app


class I18nBackendPreferenceTestCase(unittest.TestCase):
    def test_get_and_update_preferred_language(self):
        client = app.test_client()
        post_resp = client.post("/api/preferences/language", json={"preferred_language": "zh-TW"})
        self.assertEqual(post_resp.status_code, 200)
        self.assertEqual(post_resp.get_json()["preferred_language"], "zh-TW")

        get_resp = client.get("/api/preferences/language")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.get_json()["preferred_language"], "zh-TW")

        # Restaura padrão pt
        client.post("/api/preferences/language", json={"preferred_language": "pt"})


if __name__ == "__main__":
    unittest.main()
