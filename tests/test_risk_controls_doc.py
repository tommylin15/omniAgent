"""Keep the accepted production scope and the sixteen risk work packages auditable.

Documentation regression only; this test makes no network, GCP or provider calls.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
RISK = ROOT / "docs/project-risk-audit-2026-10-14.md"
PLAN = ROOT / "docs/risk-remediation-plan.md"
TODO = ROOT / "doc/todo.md"
ACCEPTANCE = ROOT / "doc/acceptance.md"
ACTIVE = [
    "README.md",
    "doc/README.md",
    "doc/todo.md",
    "doc/acceptance.md",
    "doc/spec.md",
    "doc/wbs.md",
    "docs/project-risk-audit-2026-10-14.md",
    "docs/risk-remediation-plan.md",
    "docs/shared-gemini-vertical-slice.md",
    "docs/cicd-ghcr-actions-runbook.md",
]


class ProjectRiskControlsDocsTest(unittest.TestCase):
    def test_all_sixteen_risks_have_distinct_executable_work_packages(self):
        expected = {f"R{i:02d}" for i in range(1, 17)}
        risk = RISK.read_text(encoding="utf-8")
        plan = PLAN.read_text(encoding="utf-8")
        self.assertEqual(expected, set(re.findall(r"\bR\d{2}\b", risk)))
        rows = [line for line in plan.splitlines()
                if re.match(r"^\|\s*\*\*R\d{2}\b", line)]
        ids = [re.search(r"R\d{2}", line).group(0) for line in rows]
        self.assertEqual(expected, set(ids))
        self.assertEqual(16, len(ids), "Exactly one executable plan row per risk")
        for row in rows:
            self.assertGreaterEqual(row.count("|"), 4)
            self.assertGreater(len(row.split("|")[-2].strip()), 12,
                               "Every risk needs a concrete exit condition")

    def test_current_status_cannot_claim_full_chat_release(self):
        todo = TODO.read_text(encoding="utf-8")
        acceptance = ACCEPTANCE.read_text(encoding="utf-8")
        self.assertIn("CHAT_DISPATCH_ENABLED=false", todo)
        self.assertIn("OFF", acceptance)
        self.assertIn("PARTIAL", acceptance)
        self.assertIn("NOT_REQUIRED", acceptance)
        self.assertIn("risk-remediation-plan.md", todo)

    def test_local_document_links_resolve_for_current_control_set(self):
        for rel in ACTIVE:
            path = ROOT / rel
            self.assertTrue(path.is_file(), rel)
            content = path.read_text(encoding="utf-8")
            for url in re.findall(r"\]\(([^)\s]+)\)", content):
                if re.match(r"^(https?:|mailto:|#)", url):
                    continue
                target = url.split("#", 1)[0].split("?", 1)[0]
                if target:
                    self.assertTrue((path.parent / target).exists(),
                                    f"{rel}: broken local link to {url}")


if __name__ == "__main__":
    unittest.main()
