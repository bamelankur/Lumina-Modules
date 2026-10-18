# Lumina Modules

Official community module catalogue for **Lumina Player**.

## What belongs here?

Each module is a ZIP package containing exactly one JSON manifest and its JavaScript entry file. Modules use the **Lumina Module API v1**:

- `module.json` declares the module ID, version, content type, and entry point.
- `index.js` exports `globalThis.LuminaModule` with `apiVersion: 1`.
- The catalogue is published as `repository.json`.
- Packages are SHA-256 verified by Lumina Player before installation.

## Repository layout

- `modules/<module-id>/module.json` — module metadata
- `modules/<module-id>/index.js` — provider implementation
- `packages/` — generated installable ZIP packages
- `repository.json` — catalogue consumed by Lumina Player

## Add or update a module

1. Add or edit the files in `modules/<module-id>/`.
2. Keep the manifest `id` equal to the folder name.
3. Increase `moduleVersion` when publishing a new version.
4. Push to `main`. GitHub Actions packages the modules, computes SHA-256 hashes, and refreshes `repository.json`.

## Safety and compatibility

Modules execute JavaScript inside Lumina's embedded runtime. Only install modules from sources you trust. Lumina validates package paths and checks package hashes, but a hash alone does not prove that module code is safe.

This repository is Lumina-branded. Compatibility adapters for third-party module formats may exist in the app, but Lumina's native module contract is the preferred format.

## Demo module

The included `lumina-demo` provider is a diagnostic example that returns the public Big Buck Bunny sample video. It is intended to test the search-to-playback pipeline, not to provide a streaming catalogue.


## CSX compatibility

The upstream [CSX repository](https://github.com/SaurabhKaperwan/CSX) contains Kotlin CloudStream plugins, not Lumina JavaScript modules. Its repository URL therefore cannot be installed directly by Lumina. This catalogue now includes **CSX Moviesmod**, a Lumina API v1 JavaScript port of the Moviesmod provider as the first compatibility module. It implements search, details, source/episode discovery, and returns direct media URLs when exposed by a source page.

CloudStream-specific Kotlin extractors and the other CSX providers are not automatically included; they need individual JavaScript ports and testing against Lumina's runtime. The packaging workflow creates a separate ZIP containing exactly one `module.json` and one `index.js` per module, then updates `repository.json` with the ZIP SHA-256.
