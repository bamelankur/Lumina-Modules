import json,tempfile,unittest,zipfile
from pathlib import Path
from lumina_compat.core import module_template,validate_module,package_module,build_repository,validate_repository
class Tests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory(); self.root=Path(self.t.name); self.mod=self.root/"demo"; self.mod.mkdir()
  m,js=module_template("demo-module","Demo","1.0.0","video")
  (self.mod/"module.json").write_text(json.dumps(m)); (self.mod/"index.js").write_text(js); (self.mod/"LICENSE").write_text("License review.")
 def tearDown(self): self.t.cleanup()
 def test_scaffold_validates(self): self.assertEqual(validate_module(self.mod),[])
 def test_extra_json_rejected(self):
  (self.mod/"package.json").write_text("{}")
  self.assertTrue(any("exactly one" in e for e in validate_module(self.mod)))
 def test_package_hash_and_repository(self):
  dist=self.root/"dist"; result=package_module(self.mod,dist)
  repo=build_repository(dist,"https://raw.githubusercontent.com/example/repo/main/packages")
  self.assertEqual(repo["modules"][0]["sha256"],result["sha256"])
  self.assertEqual(validate_repository(dist/"repository.json"),[])
  with zipfile.ZipFile(result["zip"]) as z: self.assertEqual([n for n in z.namelist() if n.endswith(".json")],["module.json"])
 def test_bad_id(self):
  m=json.loads((self.mod/"module.json").read_text()); m["id"]="bad id"; (self.mod/"module.json").write_text(json.dumps(m))
  self.assertTrue(any("id must match" in e for e in validate_module(self.mod)))
if __name__=="__main__": unittest.main()
