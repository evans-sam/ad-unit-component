# Verify publish correctness in the build

> Design spec — follow-on to [PR #31](https://github.com/evans-sam/ad-unit-component/pull/31) (issue #8). Issue to be opened on approval.

## Summary

Add a `check:exports` step to `bun run build` that runs [`@arethetypeswrong/cli`](https://github.com/arethetypeswrong/arethetypeswrong.github.io) (attw) and [`publint`](https://github.com/publint/publint) against the packed tarball. Both tools simulate Node module + types resolution, exit non-zero on failure, and replace the hand-rolled `Verify build artifacts` shell step in CI with a derived check that scales with the `exports` map.

## Motivation

PR #31 (subpath exports for adapters) established four published entrypoints: `.`, `./adapters/gam`, `./adapters/prebid`, `./adapters/apstag`. Each has `import` and `types` conditions pointing at `./dist/...` paths. The tests added in that PR (`test/build.test.ts`) operate on in-memory `Bun.build` of source — they verify the source-to-build module graph but never confirm that the path strings published in the `exports` map resolve to real files on disk after the full build.

The "Out of scope" section of [`2026-04-15-subpath-exports-design.md`](./2026-04-15-subpath-exports-design.md) called this out explicitly:

> **Publish-time smoke test for subpath resolution.** The publish workflow runs `bun run build`; whether `node -e 'require("@ad-unit/core/adapters/gam")'` works after `npm install` is a separate CI task if we decide it is worth it.

A typo in the `exports` map — wrong case (`./dist/adapters/Gam.js`), missing extension, wrong slash — passes every existing test but breaks the moment a consumer runs `npm install` and tries to import the subpath. The CI step at [`.github/workflows/ci.yml:39-44`](../../../.github/workflows/ci.yml) hardcodes assertions for `dist/index.js` and `dist/index.d.ts` only; the new `dist/adapters/*` paths from PR #31 are not covered.

## Approach

Two off-the-shelf CLIs gated as the final phase of `bun run build`:

```
bun run build
 ├─ build:js        (build.ts → Bun.build)
 ├─ build:types     (tsc --emitDeclarationOnly)
 └─ check:exports   (attw + publint)
```

attw simulates Node module + types resolution against the packed tarball under four target conditions (`node10`, `node16` from CJS, `node16` from ESM, `bundler`). It catches exports-map typos, missing types conditions, ordering bugs, and dual-package hazards that would surface only at consumer install time.

publint statically validates the rest of `package.json` for publishing correctness — `exports`/`main`/`module`/`types` consistency, `files` field coverage, deprecated patterns, condition ordering.

Both tools exit 0 on pass, non-zero on fail. Chaining them into `build` means CI, the publish workflow, and a developer running `bun run build` locally all get the same gate.

### Why off-the-shelf instead of a hand-rolled script

A hand-rolled `verify-exports.ts` was the original approach — iterate `pkg.exports`, skip the wildcard, assert each enumerated `import` and `types` path exists and is non-empty. Switching to attw + publint:

- Catches the original gap (subpath paths missing from disk) **plus** broader publish-correctness issues a custom script wouldn't reach: per-condition resolution mismatches, types-vs-import path divergence, `default` ordering, `files` field gaps.
- Less code to own. The maintenance surface is two devDeps; the tools are widely used (tRPC, vitest, lit, sveltekit) and updated as the ecosystem moves.
- attw runs against the actual tarball (`--pack`), so it sees exactly what `npm publish` would ship — closer to the real failure mode than file-system reads.

The tradeoff: stricter than the original ask. The first run will likely surface findings beyond the "missing file" gap that motivated this work. The implementation plan includes a triage step for those findings (see Implementation notes below).

## `package.json` changes

```jsonc
{
  "devDependencies": {
    "@arethetypeswrong/cli": "^0.18.0",
    "publint": "^0.3.0"
  },
  "scripts": {
    "build": "bun run build:js && bun run build:types && bun run check:exports",
    "check:exports": "bunx attw --pack . --ignore-rules cjs-resolves-to-esm --ignore-rules no-resolution && bunx publint --strict --pack bun"
  }
}
```

### attw flags

- `--pack .` — packs the current directory as a tarball internally and analyzes that. The check runs against exactly what `npm publish` would ship, including the `files` field's effect on what gets included.
- `--ignore-rules cjs-resolves-to-esm --ignore-rules no-resolution` — both rules are suppressed for documented design reasons (attw requires the flag repeated per rule; comma-separated values are rejected):
  - `cjs-resolves-to-esm`: the package is ESM-only by design (no `require` condition, no `.cjs` output, `"type": "module"`). Fires on every entry; suppression is the correct expression of the design choice, not a workaround.
  - `no-resolution`: fires for adapter subpaths under `node10` resolution, because node10 ignores the `exports` map entirely. Any package with subpath exports inherently fails on node10. This is an inherent limitation of node10 tooling, not a package defect.
- `untyped-resolution` is deliberately **not** suppressed — it catches the "exports path exists but types condition is wrong" gap. The decision to suppress `no-resolution` (above) was made after the first baseline run; the gap-closure probe in Task 5 verifies that wildcard/typo bugs still trigger a different attw rule and fail the build.

### publint flags

- `--strict` — promotes warnings to errors. The default level lets warnings pass; in CI we want a single gate that fails on anything publint flags.
- `--pack bun` — uses `bun pm pack` instead of `npm pack`. Keeps the toolchain pure-Bun and avoids spawning npm just for tarball construction.

## CI workflow changes

Delete the `Verify build artifacts` step at [`.github/workflows/ci.yml:39-44`](../../../.github/workflows/ci.yml):

```yaml
- name: Verify build artifacts
  run: |
    test -f dist/index.js || { echo "dist/index.js missing"; exit 1; }
    test -f dist/index.d.ts || { echo "dist/index.d.ts missing"; exit 1; }
    test -s dist/index.js || { echo "dist/index.js is empty"; exit 1; }
    test -s dist/index.d.ts || { echo "dist/index.d.ts is empty"; exit 1; }
```

The previous step's job is now done by `bun run build` itself, transitively. Keeping it would duplicate truth (the YAML hardcodes `index.js` / `index.d.ts`; `check:exports` derives from `exports`) and lag behind any future subpath additions.

The publish workflow ([`.github/workflows/publish.yml`](../../../.github/workflows/publish.yml)) needs no change — it already calls `bun run build`, which now includes the verification step.

## Failure modes and what they look like

The two tools have non-overlapping responsibilities once `no-resolution` is suppressed in attw (see attw flags above). **publint is the load-bearing tool for missing-file detection**; attw covers everything else.

**Path missing from disk (enumerated subpath).** publint reports `pkg.exports["./adapters/X"].import.default is ./dist/adapters/Y.js but the file is not published. Is it specified in pkg.files?` — caught at publish-correctness layer because the path isn't in the packed tarball. attw is silent on this case (it shows the entry as 🟢 since `no-resolution` is suppressed). The Task 5 probe in the implementation plan validates this empirically.

**Path missing from disk (wildcard `./adapters/*`).** Same — publint catches: `pkg.exports["./adapters/*"].import.default is ./dist/missing/*.js but does not match any files.` attw shows wildcard entries as `(wildcard)` and performs no per-path resolution check at all on wildcards.

**Path exists but types condition wrong.** attw flags `untyped-resolution` for the affected condition; the entry shows a different glyph in the per-condition table. publint may or may not also flag.

**`exports` key has no matching dist file because `files` doesn't include the parent directory.** publint's tarball pack catches this — the file isn't in the published artifact, so the path effectively doesn't exist as far as a consumer is concerned.

**Tool-removal hazard.** Because publint is doing the missing-file detection work that attw is suppressed for, `publint --strict` is not optional. If a future maintainer removes publint or drops `--strict`, the `no-resolution` suppression in attw becomes a silent gap — exports-path typos would no longer fail the build. Any change to the publint side of `check:exports` should be reviewed against this constraint.

## Implementation notes

The build script chain is order-sensitive: `check:exports` must run after both `build:js` (writes `dist/*.js`) and `build:types` (writes `dist/*.d.ts`). The proposed `&&` chain enforces this.

`bun run build:verify` is **not** added as a separate script. The whole point of `check:exports` is that it runs as part of `build`; making it independently invokable is fine, but `check:exports` already serves that purpose without a redundant alias.

### First-run triage step

attw and publint will likely surface findings beyond the original gap on the first run — they are stricter than the project's current implicit asserts. The implementation plan must include an explicit step where:

1. The implementer runs `bun run check:exports` (or the constituent commands) against the current `dist/`.
2. Each finding is triaged: real bug → fix the package; expected-noise per the project's design choices → add to `--ignore-rules` (attw), and update this design's "attw flags" section with a one-line justification per added rule. publint findings that are intentional (e.g., a deprecated pattern we're keeping for a documented reason) get the same treatment in this design.
3. Final command line in `package.json` reflects the triaged decisions.

Don't pre-pessimize the suppressions. Start with `cjs-resolves-to-esm` only and add others only if the actual run shows them as expected-noise.

### Lockfile + offline considerations

Both tools are pure-JS Node packages with no native dependencies. `bun install --frozen-lockfile` (as used by CI) will install them deterministically. No registry-spec quirks.

## Out of scope

- **Validating that `dist/` chunk references resolve.** Bun emits chunks atomically with the entry-point that imports them; not a publication-layer concern.
- **Asserting `dist/` contains no extra files** (over-publication). Controlled by `files` in `package.json`, which publint already validates. Stray emitted files that pass the `files` filter ship; that's a separate decision.
- **Runtime `import()` smoke test of each subpath.** attw's resolution simulation is static. A runtime check (spawn Node, `import()` each subpath, assert no throw) is possible later if a real bug slips through static analysis. Not worth the CI complexity now.
- **Per-condition CJS support.** The package is ESM-only by deliberate design; suppressing `cjs-resolves-to-esm` is the correct expression of that.
- **Replacing the existing `test/build.test.ts` tree-shake assertions.** That file tests a different concern (core bundle is free of adapter code) and stays unchanged.

## Further notes

- attw uses `npm pack` internally for `--pack .`. GitHub-hosted ubuntu runners ship with Node + npm preinstalled, so this works out of the box in CI; the implementation step should verify by running locally and in a CI dry-run before merging. publint, which runs second, uses `bun pm pack` per `--pack bun`, keeping that half of the chain pure-Bun.
- The `^0.18` and `^0.3` version ranges are starting points; the implementer should verify the latest stable major at install time and pin appropriately.
- This work does not touch `src/` or any test files. The diff is `package.json` (devDeps + script), `bun.lockb`, and `.github/workflows/ci.yml` (delete one step).
