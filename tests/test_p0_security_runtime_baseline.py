from pathlib import Path
import ast
import unittest
ROOT=Path(__file__).resolve().parents[1]
class P0Audit(unittest.TestCase):
  def test_read_only_inventory_never_has_mutation_commands_or_secret_access(self):
    script=(ROOT/"scripts/p0_security_runtime_baseline.py").read_text()
    ast.parse(script)
    for denied in ("add-iam-policy-binding","remove-iam-policy-binding",
                   "gcloud run deploy","secrets versions access","DROP TABLE",
                   "UPDATE omni_chat","INSERT INTO"):
      self.assertNotIn(denied,script)
if __name__=="__main__":unittest.main()
