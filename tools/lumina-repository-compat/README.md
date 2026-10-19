# Lumina Repository Compatibility Framework

Python 3.10+ toolkit to inspect extension repositories, scaffold a Lumina adapter, validate modules, package compliant ZIPs, calculate SHA-256 hashes, and generate `repository.json`. Standard library only.

**Important:** inspection and packaging can be automated; arbitrary CloudStream/Kotlin/Java/TypeScript/browser extensions cannot be reliably translated into working Lumina JavaScript by generic heuristics. The scaffold is deliberately incomplete until its source-specific methods are implemented and tested.

## Quick start

```bash
python -m lumina_compat inspect https://github.com/OWNER/EXTENSION-REPO
python -m lumina_compat scaffold ./source-checkout --module-id example-source --name "Example Source"
# Implement build/example-source/index.js for the actual source/API.
python -m lumina_compat validate build/example-source
python -m lumina_compat package build/example-source --output dist
python -m lumina_compat repository dist --base-url https://raw.githubusercontent.com/OWNER/MODULE-REPO/main/packages
python -m lumina_compat check-repository dist/repository.json
```

`inspect` accepts a local directory or HTTPS Git URL (Git must be installed). Remote sources are cloned to a temporary directory; the source repo is not modified.

## Commands

- `inspect SOURCE [--json]`: heuristically identifies languages, likely extension APIs, entry points, dependency manifests, and license signals. Static inspection only; does not execute source code or perform a security audit.
- `scaffold SOURCE --module-id ID --name NAME [--version 1.0.0] [--content-type video|manga|music] [--output build]`: creates `module.json`, a single-file `index.js` scaffold, a licensing review notice, and an inspection report.
- `validate MODULE_DIR`: validates manifest, entry file, package file counts/sizes, safe paths, required functions and single-JSON rule.
- `package MODULE_DIR --output dist`: validates, writes `ID-VERSION.zip`, metadata, and SHA-256.
- `repository DIST --base-url HTTPS_URL [--output PATH]`: creates `repository.json` using generated ZIP metadata and freshly recalculated hashes.
- `check-repository FILE`: checks repository JSON shape, HTTPS URLs, IDs, content types, duplicates, and lowercase 64-character hashes.

## Package constraints enforced

- Exactly one `.json` file: `module.json`
- `config.runtime.entry` exists and is under 2 MiB
- No static `import` or `require(...)` in the entry
- Under 50 MiB uncompressed total, at most 1000 files, each under 20 MiB
- No symlinks, absolute paths, `..` traversal, or backslash paths
- `moduleSystem: lumina`, `contractVersion: 1`, supported content type
- `globalThis.LuminaModule`, `apiVersion: 1`, and required methods

## GitHub Actions

The included workflow runs unit tests and validates the demo scaffold. It does not publish packages or commit generated files. Publishing should be a separate workflow with explicit write permissions and an intentional release policy.

## Security and licensing

Never execute third-party code during inspection. Review obfuscation, dependencies, network destinations, licensing, and API terms manually. Do not bypass DRM, paywalls, authentication, or source restrictions. Lumina itself must enforce runtime sandboxing and network allowlists; packaging validation is not a sandbox or security audit.
