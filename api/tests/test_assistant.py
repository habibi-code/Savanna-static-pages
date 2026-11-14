"""Unit tests for the Savanna Multilingual Assistant."""
import asyncio
import json
import os
import unittest
from pathlib import Path


class TestOfflineProvider(unittest.TestCase):
    """Verify the offline FAQ AI provider operates completely without internet."""

    def setUp(self):
        # Mock settings
        class MockSettings:
            ai_provider = "offline"
            docs_path = str(Path(__file__).parent.parent.parent / "docs")
        self.settings = MockSettings()

    def test_offline_chat_english(self):
        from ai.offline_provider import OfflineProvider
        from models import ChatMessage

        provider = OfflineProvider(self.settings)
        self.assertEqual(provider.name, "offline")

        loop = asyncio.new_event_loop()
        try:
            # Query matching FAQ: "What is the overall score threshold for graduation?"
            reply, citations = loop.run_until_complete(
                provider.chat(
                    message="What is the overall score threshold for graduation?",
                    language="en",
                    context_chunks=[],
                    history=[]
                )
            )
            self.assertIn("⚠️ Offline mode", reply)
            self.assertTrue(len(reply) > 20)
            self.assertTrue(len(citations) > 0)
            self.assertIn("70%", reply)
        finally:
            loop.close()

    def test_offline_chat_amharic(self):
        from ai.offline_provider import OfflineProvider

        provider = OfflineProvider(self.settings)

        loop = asyncio.new_event_loop()
        try:
            reply, citations = loop.run_until_complete(
                provider.chat(
                    message="የኮርስ ማጠናቀቂያ ደረጃ ምን ያህል ነው?",
                    language="am",
                    context_chunks=[],
                    history=[]
                )
            )
            self.assertIn("⚠️", reply)
            self.assertTrue(len(citations) > 0)
        finally:
            loop.close()

    def test_offline_with_rag_chunks(self):
        from ai.offline_provider import OfflineProvider

        provider = OfflineProvider(self.settings)
        mock_chunks = [{
            "id": "chunk_mock_123",
            "text": "Virtual assistants often handle administrative tasks and email scheduling.",
            "source": "concept-va.html"
        }]

        loop = asyncio.new_event_loop()
        try:
            reply, citations = loop.run_until_complete(
                provider.chat(
                    message="What do VAs do?",
                    language="en",
                    context_chunks=mock_chunks,
                    history=[]
                )
            )
            self.assertIn("Virtual assistants often handle", reply)
            self.assertEqual(len(citations), 1)
            self.assertEqual(citations[0].id, "chunk_mock_123")
        finally:
            loop.close()


class TestSMSFormatting(unittest.TestCase):
    """Verify SMS 160-character pagination and command stripping."""

    def test_truncate_single_page(self):
        from routers.sms import truncate_sms
        short = "This is a brief announcement for students."
        res = truncate_sms(short, page=1)
        self.assertTrue(len(res) <= 160)
        self.assertTrue(res.startswith("(1/1)"))
        self.assertIn(short, res)

    def test_truncate_multi_page(self):
        from routers.sms import truncate_sms
        long_text = "Word " * 60  # 300 chars
        p1 = truncate_sms(long_text, page=1)
        p2 = truncate_sms(long_text, page=2)
        self.assertTrue(len(p1) <= 160)
        self.assertTrue(len(p2) <= 160)
        self.assertTrue(p1.startswith("(1/2)"))
        self.assertTrue(p2.startswith("(2/2)"))

    def test_strip_prefix(self):
        from routers.sms import _strip_prefix
        text, prefix = _strip_prefix("JOB virtual assistant")
        self.assertEqual(prefix, "JOB")
        self.assertEqual(text, "virtual assistant")

        text, prefix = _strip_prefix("HELP")
        self.assertEqual(prefix, "HELP")
        self.assertEqual(text, "")


class TestJobData(unittest.TestCase):
    """Verify seeded jobs.json has valid structure."""

    def test_jobs_file(self):
        jobs_path = Path(__file__).parent.parent.parent / "docs" / "jobs" / "jobs.json"
        self.assertTrue(jobs_path.exists())
        jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
        self.assertTrue(len(jobs) >= 5)

        first = jobs[0]
        self.assertIn("id", first)
        self.assertIn("title", first)
        self.assertIn("company", first)
        self.assertIn("description", first)
        self.assertIn("skills", first)


class TestAccommodationReference(unittest.TestCase):
    """Verify accommodation reference format."""

    def test_generate_reference(self):
        from routers.accommodate import _generate_reference
        ref = _generate_reference()
        self.assertTrue(ref.startswith("ACC-202"))
        self.assertEqual(len(ref), 13)


if __name__ == "__main__":
    unittest.main()
