# Repo Chores: License, Package Name, Registry Publishing

Issue: [#14](https://github.com/evans-sam/ad-unit-component/issues/14)
Date: 2026-04-15

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| License | MIT | Standard for JS/TS libraries; zero adoption friction |
| Package name | `@ad-unit/core` | Scoped namespace for future adapter packages (`@ad-unit/prebid-adapter`, etc.) |
| Registry | npm public | Standard for open-source; no consumer `.npmrc` config needed |
| CONTRIBUTING.md | Deferred | Adapter interfaces (#7) not yet merged; add when there's concrete guidance for adapter authors |

## Changes

### 1. LICENSE file

Add `LICENSE` at repo root with standard MIT text. Copyright line: `Copyright (c) 2026 Sam Evans`.

### 2. package.json metadata

Update the following fields:

```jsonc
{
  "name": "@ad-unit/core",
  "description": "Vendor-agnostic <ad-unit> web component — declare ad slots in HTML, handle vendor behavior through lifecycle event adapters",
  "license": "MIT",
  "author": "Sam Evans (https://github.com/evans-sam)",
  "repository": {
    "type": "git",
    "url": "https://github.com/evans-sam/ad-unit-component.git"
  },
  "keywords": [
    "web-component",
    "custom-element",
    "ad-unit",
    "advertising",
    "prebid",
    "gam",
    "openrtb"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

Fields left unchanged (already correct):
- `version`: `0.1.0`
- `files`: `["dist"]`
- `exports`, `main`, `types` — already point at `dist/`
- `type`: `"module"`

### 3. README updates

**Install command:** Change from `bun install ad-unit-component` to `npm install @ad-unit/core`.

**Import path:** Change from `import "ad-unit-component"` to `import "@ad-unit/core"`.

**Add refresh section:** Document the `refresh()` method and `ad-unit:refresh` event that shipped in issue #6. Brief usage example showing `adUnit.refresh()` and listening for the refresh event. Mention that `refreshCount` increments per call and is carried on event details.

**Add adapter concept blurb:** Short paragraph after the lifecycle section explaining that vendor-specific behavior (Prebid, GAM, apstag) lives in external adapter packages that listen to lifecycle events. Note that adapter packages are coming soon (link to issues #10-12). This is the key architectural message for someone landing on the repo.

**Type import example:** Update the lifecycle code example import from `import type { AdUnitLifecycleEvent } from "ad-unit-component"` to `import type { AdUnitLifecycleEvent } from "@ad-unit/core"`.

### 4. No other file changes

- `files` field already restricts the published package to `dist/` — no `.npmignore` needed.
- Build config (`build.ts`) is unchanged; it already outputs to `dist/`.
- No source files reference the package name internally.

## Manual steps (package owner)

These steps cannot be automated and must be done by the repo owner:

1. **Create npm account** (if not already): [npmjs.com/signup](https://www.npmjs.com/signup)
2. **Create `@ad-unit` org on npm**: [npmjs.com/org/create](https://www.npmjs.com/org/create) — free tier is sufficient for public packages
3. **Authenticate**: Run `npm login` from terminal
4. **Publish** (after code changes are merged and built): `bun run build && npm publish`

## Out of scope

- CONTRIBUTING.md — deferred until adapter registry (#7) ships
- CI/CD publish automation — separate concern, not part of this issue
- Adapter packages — issues #10, #11, #12
- Version bumping strategy / changelogs — future concern

## Acceptance criteria mapping

| Criterion | Addressed by |
|-----------|-------------|
| LICENSE file added to repo root | Change 1 |
| Package name decided and updated in package.json | Change 2 (`@ad-unit/core`) |
| Registry target decided and documented | Decision table + manual steps section |
| package.json metadata fields complete | Change 2 |
| files field verified | Change 4 (already correct) |
| README updated with current architecture and usage | Change 3 |
