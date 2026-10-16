import copy
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "scripts/verify_preview_route.py"
spec = importlib.util.spec_from_file_location("preview_route", path)

class PreviewRouteTest(unittest.TestCase):
    def test_only_preview_can_change_and_formal_traffic_stays_fixed(self):
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        before = {"spec": {"template": {"image": "fixed"}}, "status": {"traffic": [
            {"revisionName": "live", "percent": 100},
            {"revisionName": "candidate", "tag": "ghcr-sha"},
            {"revisionName": "old-preview", "tag": "preview"}]}}
        after = copy.deepcopy(before)
        after["status"]["traffic"][-1] = {"revisionName": "candidate", "tag": "preview", "url": "https://preview.example"}
        self.assertEqual(module.validate(before, after, "candidate"), "https://preview.example")
        self.assertEqual(module.validate(after, after, "candidate"), "https://preview.example")
        for change in (lambda d: d["status"]["traffic"][0].update(percent=90),
                       lambda d: d["status"]["traffic"][1].update(revisionName="other"),
                       lambda d: d["status"]["traffic"][-1].update(percent=10),
                       lambda d: d["status"]["traffic"][-1].update(revisionName="wrong"),
                       lambda d: d["spec"]["template"].update(image="changed")):
            bad = copy.deepcopy(after)
            change(bad)
            with self.assertRaises(ValueError): module.validate(before, bad, "candidate")
