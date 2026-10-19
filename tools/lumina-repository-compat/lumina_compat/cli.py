import argparse,json,sys
from pathlib import Path
from .core import source_checkout,inspect_tree,module_template,validate_module,package_module,build_repository,validate_repository,warnings_module

def main(argv=None):
 p=argparse.ArgumentParser(prog="lumina-compat"); sub=p.add_subparsers(dest="cmd",required=True)
 x=sub.add_parser("inspect"); x.add_argument("source"); x.add_argument("--json",action="store_true")
 x=sub.add_parser("scaffold"); x.add_argument("source"); x.add_argument("--module-id",required=True); x.add_argument("--name",required=True); x.add_argument("--version",default="1.0.0"); x.add_argument("--content-type",default="video",choices=["video","manga","music"]); x.add_argument("--output",default="build")
 x=sub.add_parser("validate"); x.add_argument("module_dir")
 x=sub.add_parser("package"); x.add_argument("module_dir"); x.add_argument("--output",default="dist")
 x=sub.add_parser("repository"); x.add_argument("dist_dir"); x.add_argument("--base-url",required=True); x.add_argument("--output")
 x=sub.add_parser("check-repository"); x.add_argument("repository_json")
 a=p.parse_args(argv)
 try:
  if a.cmd=="inspect":
   with source_checkout(a.source) as r: report=inspect_tree(r)
   if a.json: print(json.dumps(report,indent=2))
   else:
    print("Lumina compatibility inspection\n===============================")
    print("Files scanned:",report["file_count_scanned"],"\nLicense signal:",report["license_signal_found"])
    for f in report["likely_extension_families"]: print("-",f["family"],"(",len(f["hits"]),"evidence hits)")
    print("\nDependency manifests:",", ".join(report["dependency_manifests"]) or "none detected")
    print(report["assessment"])
  elif a.cmd=="scaffold":
   with source_checkout(a.source) as r: report=inspect_tree(r)
   out=Path(a.output)/a.module_id; out.mkdir(parents=True,exist_ok=True)
   m,js=module_template(a.module_id,a.name,a.version,a.content_type)
   (out/"module.json").write_text(json.dumps(m,indent=2)+"\n")
   (out/"index.js").write_text(js)
   (out/"LICENSE-NOTICE.md").write_text("# Licensing review required\n\nReview upstream license and source/API terms before distributing a module.\n")
   (out/"source-inspection.json").write_text(json.dumps(report,indent=2)+"\n")
   print("Scaffold created:",out,"— implement index.js and test in Lumina.")
  elif a.cmd=="validate":
   errors=validate_module(Path(a.module_dir))
   for w in warnings_module(Path(a.module_dir)): print("WARNING:",w)
   for e in errors: print("ERROR:",e)
   if errors: return 1
   print("Validation passed.")
  elif a.cmd=="package": print(json.dumps(package_module(Path(a.module_dir),Path(a.output)),indent=2))
  elif a.cmd=="repository": print(json.dumps(build_repository(Path(a.dist_dir),a.base_url,Path(a.output) if a.output else None),indent=2))
  elif a.cmd=="check-repository":
   errors=validate_repository(Path(a.repository_json))
   for e in errors: print("ERROR:",e)
   if errors: return 1
   print("Repository manifest is valid.")
  return 0
 except Exception as e:
  print("ERROR:",e,file=sys.stderr); return 2

if __name__=="__main__": raise SystemExit(main())
