# CI/CD Pipeline Design

**Issue:** [#15 — Set up CI/CD pipeline](https://github.com/evans-sam/ad-unit-component/issues/15)
**Date:** 2026-04-15

## Overview

GitHub Actions CI/CD for `@ad-unit/core`. Four focused workflow files, each with a single responsibility. All workflows use Bun as the runtime — no Node for build/test/lint steps.

## Workflow Files

### 1. CI (`ci.yml`)

**Triggers:** `pull_request` (all branches) + `push` to `main`

**Single job — steps in order:**

1. `actions/checkout`
2. `oven-sh/setup-bun` (pin `bun-version: 1.x`)
3. `bun install --frozen-lockfile`
4. `bun run lint` — Biome check
5. `bun run lint:compat` — oxlint browser-compat lint
6. `tsc --noEmit` — type check
7. `bun test --coverage` — tests with coverage output to console
8. `bun run build` — bundle JS + emit declarations to `dist/`
9. Verify build artifacts — run a Node/Bun script that asserts `dist/index.js` and `dist/index.d.ts` exist on disk and that `import("./dist/index.js")` resolves without throwing

Coverage is reported in CI logs only. PR comment reporting is deferred.

### 2. Dependency Audit (`dependency-audit.yml`)

**Triggers:** `pull_request` (all branches) + `push` to `main`

**Single job — steps:**

1. `actions/checkout`
2. `oven-sh/setup-bun`
3. `bun install --frozen-lockfile`
4. `bun audit --audit-level=high` — scans ALL transitive dependencies against the GitHub Advisory Database, exits 1 on high/critical vulnerabilities

Runs on every PR and push to main. Catches new CVEs against existing deps even when no dependencies changed. Required status check blocks merging.

### 3. Release Drafter (`release-drafter.yml`)

**Trigger:** `push` to `main` (PR merges)

**Uses:** `release-drafter/release-drafter`

**Config file:** `.github/release-drafter.yml`

- Categorizes PRs by label: Features, Bug Fixes, Maintenance/Chores
- Version resolver based on labels: `major`, `minor`, `patch` (defaults to `patch`)
- Template includes contributor list and full changelog link
- Tag format: `v$RESOLVED_VERSION` (e.g., `v0.2.0`)

The draft accumulates as PRs merge. To release: review/edit the draft in GitHub Releases, then publish. Publishing creates the tag and triggers the publish workflow.

No Bun setup needed — purely a GitHub API operation.

### 4. Publish (`publish.yml`)

**Trigger:** `release: published`

**Permissions:** `contents: read`, `id-token: write` (OIDC for npm trusted publishing)

**Single job — steps:**

1. `actions/checkout` (at the release tag)
2. `oven-sh/setup-bun`
3. `actions/setup-node` — needed for npm registry auth via OIDC
4. `bun install --frozen-lockfile`
5. `bun run build`
6. `npm publish --provenance` — authenticated via OIDC, no NPM_TOKEN secret

Rebuilds from the tagged commit rather than caching artifacts from CI. This ensures the published package matches exactly what's tagged.

**Prerequisites:** Trusted publisher must be configured on npmjs.com, linking `evans-sam/ad-unit-component` repo and the `publish.yml` workflow.

## Files Created

| Path | Purpose |
|---|---|
| `.github/workflows/ci.yml` | Lint, typecheck, test, build |
| `.github/workflows/dependency-audit.yml` | Full dependency vulnerability scan |
| `.github/workflows/release-drafter.yml` | Auto-update draft release on PR merge |
| `.github/workflows/publish.yml` | Publish to npm on release |
| `.github/release-drafter.yml` | Release drafter category/version config |

## Branch Protection

After workflows are merged, enable branch protection on `main`:

- Require status checks to pass: `ci`, `dependency-audit`
- Require branches to be up to date before merging

This is a manual step in GitHub repo settings, not automated by the workflows.

## Deferred

- **Bundle size reporting** — library will always be small; not needed now
- **Coverage PR comments** — coverage output is in CI logs for now
- **`bun publish`** — Bun's publish is still experimental; using `npm publish` with provenance

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Workflow structure | 4 separate files | Clear ownership, scoped permissions, easy to debug |
| Publish trigger | `release: published` | Covers both draft-publish and direct release creation |
| npm auth | Trusted publishing (OIDC) | No long-lived tokens, more secure |
| Release drafting | `release-drafter/release-drafter` | Standard pattern, auto-accumulates PR changes |
| Dependency audit | `bun audit --audit-level=high` | Scans all deps against GitHub Advisory DB, native to Bun |
| Coverage reporting | Console output only | Simple; PR comments deferred |
