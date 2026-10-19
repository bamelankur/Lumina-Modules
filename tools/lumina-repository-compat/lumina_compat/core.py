from __future__ import annotations
import hashlib, json, re, shutil, subprocess, tempfile, zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

MAX_ZIP=50*1024*1024
MAX_FILE=20*1024*1024
MAX_ENTRY=2*1024*1024
MAX_FILES=1000
ID_RE=re.compile(r"^[A-Za-z0-9._-]{1,100}$")
SHA_RE=re.compile(r"^[0-9a-f]{64}$")
CONTENT_TYPES={"video","manga","music"}

def sha256_file(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def load_json(path):
    try: return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e: raise ValueError(f"Invalid JSON in {path}: {e}") from e

from contextlib import contextmanager
@contextmanager
def source_checkout(source):
    p=Path(source).expanduser()
    if p.exists() and p.is_dir():
        yield p.resolve(); return
    u=urlparse(source)
    if u.scheme!="https" or not u.netloc: raise ValueError("Source must be a local directory or HTTPS Git URL.")
    with tempfile.TemporaryDirectory(prefix="lumina-inspect-") as tmp:
        target=Path(tmp)/"source"
        try: subprocess.run(["git","clone","--depth","1",source,str(target)],check=True,capture_output=True,text=True,timeout=180)
        except FileNotFoundError as e: raise ValueError("Git is required to inspect remote repositories.") from e
        except subprocess.CalledProcessError as e: raise ValueError(f"git clone failed: {e.stderr[-1000:]}") from e
        yield target

def inspect_tree(root):
    ignored={".git","node_modules","vendor","build","dist",".dart_tool"}
    files=[]; counts={}; license_found=False; samples=[]
    license_names={"LICENSE","LICENSE.MD","LICENSE.TXT","COPYING","NOTICE"}
    for p in root.rglob("*"):
        if any(part in ignored for part in p.parts) or p.is_symlink() or not p.is_file(): continue
        rel=p.relative_to(root).as_posix(); files.append(rel)
        if p.suffix: counts[p.suffix.lower()]=counts.get(p.suffix.lower(),0)+1
        if p.name.upper() in license_names or p.name.upper().startswith("LICENSE-"): license_found=True
        if p.suffix.lower() in {".kt",".java",".js",".mjs",".cjs",".ts",".tsx",".py",".dart",".json",".md",".yaml",".yml"}:
            try: samples.append((rel,p.read_text(encoding="utf-8",errors="ignore")[:200000]))
            except OSError: pass
        if len(files)>=20000: break
    patterns={
      "CloudStream/Kotlin":[r"@Extension",r"SearchResponse",r"LoadResponse",r"ExtractorApi",r"VideoExtractor"],
      "JavaScript/TypeScript":[r"\bexport\s+(default|class|function|const)",r"\bmodule\.exports\b",r"\bfetch\s*\(",r"\basync\s+function\b"],
      "Python":[r"\bdef\s+search\b",r"\bimport\s+requests\b"],
      "Dart/Flutter":[r"\bclass\s+\w+\s+extends\b",r"\bFuture<",r"pubspec\.yaml"]
    }
    families=[]
    for family, pats in patterns.items():
        hits=[]
        for rel,txt in samples:
            for pat in pats:
                if re.search(pat,txt):
                    hits.append({"file":rel,"pattern":pat})
                    if len(hits)>=12: break
            if len(hits)>=12: break
        if hits: families.append({"family":family,"hits":hits})
    manifests=[f for f in files if Path(f).name.lower() in {"package.json","pubspec.yaml","build.gradle","build.gradle.kts","pom.xml","cargo.toml"}]
    entries=[f for f in files if Path(f).name.lower() in {"index.js","main.js","main.kt","build.gradle","package.json","pubspec.yaml"}]
    return {"root":str(root),"file_count_scanned":len(files),"extensions":dict(sorted(counts.items(),key=lambda x:(-x[1],x[0]))),
      "likely_extension_families":families,"entry_candidates":entries[:80],"dependency_manifests":manifests[:80],
      "license_signal_found":license_found,
      "assessment":"Needs a source-specific adapter and runtime review; no automatic translation is claimed." if families else "No known API signature detected; manual inspection required."}

def module_template(module_id,name,version,content_type):
    if not ID_RE.fullmatch(module_id): raise ValueError("Invalid module ID; use letters, digits, dot, underscore or hyphen (max 100 chars).")
    if content_type not in CONTENT_TYPES: raise ValueError("Unsupported content type.")
    manifest={"id":module_id,"name":name,"moduleSystem":"lumina","contractVersion":1,"moduleVersion":version,
      "contentType":content_type,"languages":["hindi","english"],"config":{"runtime":{"entry":"index.js"}}}
    js='''// Scaffold only: implement methods for the inspected source. Do not invent URLs or results.
globalThis.LuminaModule = {
  apiVersion: 1,
  contentType: TYPE_TOKEN,
  async search(query) { // return [{title, href, image, year, description}]
    // TODO: implement source search
    return [];
  },
  async details(href) {
    // TODO: return the detail shape required by Lumina
    return {};
  },
  async episodes(href) {
    // TODO: return [{title, href, season, number, languages}]
    return [];
  },
  async stream(episodeHref, language) {
    // TODO: resolve authorized media; return {url, headers, label, subtitles} or {streams:[...]}
    return {};
  },
  async home() { return []; }
};
'''.replace("TYPE_TOKEN",json.dumps(content_type))
    return manifest,js

def validate_module(module_dir):
    root=Path(module_dir); errors=[]
    if not root.is_dir(): return [f"Module directory does not exist: {root}"]
    files=[]
    for p in root.rglob("*"):
        if p.is_symlink(): errors.append(f"Symlink not allowed: {p.relative_to(root)}")
        elif p.is_file():
            rel=p.relative_to(root).as_posix(); pp=PurePosixPath(rel)
            if pp.is_absolute() or ".." in pp.parts or "\\" in rel: errors.append(f"Unsafe path: {rel}")
            files.append(p)
    jsons=[p for p in files if p.suffix.lower()==".json"]
    manifest_path=root/"module.json"
    if len(jsons)!=1 or (jsons and jsons[0].name!="module.json"):
        errors.append(f"Package must contain exactly one .json file named module.json; found {len(jsons)}.")
    if not manifest_path.is_file(): return errors+["Missing module.json."]
    try: m=load_json(manifest_path)
    except ValueError as e: return errors+[str(e)]
    if not isinstance(m,dict): return errors+["module.json must contain a JSON object."]
    if not isinstance(m.get("id"),str) or not ID_RE.fullmatch(m["id"]): errors.append("module.json id must match [A-Za-z0-9._-]{1,100}.")
    if m.get("moduleSystem")!="lumina": errors.append('moduleSystem must be "lumina".')
    if type(m.get("contractVersion")) is not int or m["contractVersion"]!=1: errors.append("contractVersion must be integer 1.")
    if m.get("contentType") not in CONTENT_TYPES: errors.append("Unsupported contentType.")
    if not isinstance(m.get("moduleVersion"),str) or not m["moduleVersion"].strip(): errors.append("moduleVersion must be non-empty.")
    cfg=m.get("config",{}); runtime=cfg.get("runtime",{}) if isinstance(cfg,dict) else {}
    entry=runtime.get("entry") if isinstance(runtime,dict) else None
    if not isinstance(entry,str) or not entry: errors.append("config.runtime.entry must name the entry file.")
    else:
        ep=root/entry
        try: ep.resolve().relative_to(root.resolve())
        except ValueError: errors.append("Runtime entry path escapes module directory.")
        if not ep.is_file(): errors.append(f"Runtime entry file missing: {entry}")
        else:
            if ep.stat().st_size>=MAX_ENTRY: errors.append("Entry JS must be smaller than 2 MiB.")
            src=ep.read_text(encoding="utf-8",errors="replace")
            if re.search(r"(^|\n)\s*import\s+(?!\()",src) or re.search(r"\brequire\s*\(",src): errors.append("Entry must be bundled: static import/require(...) is forbidden.")
            if "globalThis.LuminaModule" not in src: errors.append("Entry must assign globalThis.LuminaModule.")
            for fn in ("search","details","episodes","stream"):
                if not re.search(r"\b"+fn+r"\s*\(",src): errors.append(f"Required method {fn}() not found.")
    if len(files)>MAX_FILES: errors.append(f"More than {MAX_FILES} files.")
    total=0
    for p in files:
        size=p.stat().st_size; total+=size
        if size>=MAX_FILE: errors.append(f"File must be smaller than 20 MiB: {p.relative_to(root)}")
    if total>=MAX_ZIP: errors.append("Uncompressed package must total less than 50 MiB.")
    if m.get("languages") is not None and not isinstance(m["languages"],list): errors.append("languages must be an array.")
    return errors

def warnings_module(root):
    warnings=[]
    try:
        m=load_json(Path(root)/"module.json"); ep=Path(root)/m.get("config",{}).get("runtime",{}).get("entry","")
        if ep.is_file() and ("TODO:" in ep.read_text(encoding="utf-8",errors="ignore") or "return {};" in ep.read_text(encoding="utf-8",errors="ignore")):
            warnings.append("Entry contains scaffold placeholders; implement and test before release.")
    except Exception: pass
    if not any((Path(root)/n).exists() for n in ("LICENSE","LICENSE.md","LICENSE.txt","NOTICE")):
        warnings.append("No LICENSE/NOTICE found; confirm rights and add an appropriate notice.")
    return warnings

def package_module(module_dir,output_dir):
    errors=validate_module(module_dir)
    if errors: raise ValueError("Validation failed:\n- "+"\n- ".join(errors))
    root=Path(module_dir); out=Path(output_dir); m=load_json(root/"module.json"); out.mkdir(parents=True,exist_ok=True)
    zp=out/f"{m['id']}-{m['moduleVersion']}.zip"
    with zipfile.ZipFile(zp,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(root.rglob("*")):
            if p.is_file(): z.write(p,p.relative_to(root).as_posix())
    with zipfile.ZipFile(zp) as z:
        names=z.namelist(); js=[n for n in names if n.lower().endswith(".json")]
        if len(js)!=1 or js[0]!="module.json": zp.unlink(missing_ok=True); raise ValueError("Archive JSON rule failed.")
        for n in names:
            pp=PurePosixPath(n)
            if pp.is_absolute() or ".." in pp.parts or "\\" in n: zp.unlink(missing_ok=True); raise ValueError(f"Unsafe ZIP path: {n}")
    digest=sha256_file(zp)
    meta={"moduleId":m["id"],"version":m["moduleVersion"],"contentType":m["contentType"],"sha256":digest,
          "packageFile":zp.name,"description":m.get("description","")}
    (out/(zp.name+".module-meta.json")).write_text(json.dumps(meta,indent=2)+"\n",encoding="utf-8")
    return {"zip":str(zp),"sha256":digest,"size":zp.stat().st_size,"metadata":meta,"warnings":warnings_module(root)}

def validate_repository(path):
    errors=[]
    try: data=load_json(path)
    except ValueError as e: return [str(e)]
    if not isinstance(data,dict) or not isinstance(data.get("modules"),list): return ['repository.json must contain a "modules" array.']
    seen=set()
    for i,x in enumerate(data["modules"]):
        pre=f"modules[{i}]"
        if not isinstance(x,dict): errors.append(f"{pre} must be object."); continue
        for k in ("moduleId","version","contentType","packageUrl","sha256"):
            if not isinstance(x.get(k),str) or not x[k]: errors.append(f"{pre}.{k} must be non-empty.")
        mid=x.get("moduleId","")
        if mid in seen: errors.append(f"Duplicate moduleId: {mid}")
        seen.add(mid)
        if not ID_RE.fullmatch(mid): errors.append(f"{pre}.moduleId invalid.")
        if not x.get("packageUrl","").startswith("https://"): errors.append(f"{pre}.packageUrl must use HTTPS.")
        if not SHA_RE.fullmatch(x.get("sha256","")): errors.append(f"{pre}.sha256 must be 64 lowercase hex chars.")
        if x.get("contentType") not in CONTENT_TYPES: errors.append(f"{pre}.contentType unsupported.")
    return errors

def build_repository(dist_dir,base_url,output=None):
    from urllib.parse import urlparse
    u=urlparse(base_url)
    if u.scheme!="https" or not u.netloc: raise ValueError("--base-url must be an HTTPS URL to the public package directory.")
    dist=Path(dist_dir); modules=[]; seen=set()
    for mp in sorted(dist.glob("*.zip.module-meta.json")):
        m=load_json(mp); zp=dist/m.get("packageFile","")
        if not zp.is_file(): raise ValueError(f"Missing package {m.get('packageFile')}")
        mid=m["moduleId"]
        if mid in seen: raise ValueError(f"Duplicate moduleId: {mid}")
        seen.add(mid)
        modules.append({"moduleId":mid,"version":m["version"],"contentType":m["contentType"],
          "description":m.get("description",""),"packageUrl":base_url.rstrip("/")+"/"+zp.name,"sha256":sha256_file(zp)})
    target=Path(output) if output else dist/"repository.json"; target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps({"modules":modules},indent=2)+"\n",encoding="utf-8")
    errors=validate_repository(target)
    if errors: target.unlink(missing_ok=True); raise ValueError("Repository invalid:\n- "+"\n- ".join(errors))
    return {"modules":modules}
