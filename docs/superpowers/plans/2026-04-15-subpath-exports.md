# Subpath Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve ES module subpaths `@ad-unit/core/adapters/{gam,prebid,apstag}` and make the build emit one chunk per subpath so importers of core alone do not pull in adapter code.

**Architecture:** Empty ES module stubs at `src/adapters/*.ts` reserve the subpaths. `build.ts` reads `package.json`'s `exports` map to derive entry points and calls `Bun.build` once with `splitting: true` — shared code (registry singletons, types) is extracted to shared chunks so the one runtime registry is preserved across chunks even when core and an adapter are loaded together. `package.json` gains enumerated subpath entries plus a `./adapters/*` wildcard fallback. An automated test in `test/build.test.ts` verifies the entry-point structure and asserts that the core bundle (and a tiny consumer fixture that imports only core) contain no adapter path references or name-string literals.

**Tech Stack:** Bun (`Bun.build`, `Bun.file`, `bun:test`), TypeScript (`tsc --emitDeclarationOnly`), ESM, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-04-15-subpath-exports-design.md`

---

## File Structure

**New files:**
- `src/adapters/gam.ts` — empty module stub
- `src/adapters/prebid.ts` — empty module stub
- `src/adapters/apstag.ts` — empty module stub
- `test/fixtures/core-only-consumer.ts` — consumer fixture for the tree-shake test
- `test/build.test.ts` — four tests covering subpath resolution, entry-point structure, core-bundle purity, and consumer-bundle purity

**Modified files:**
- `package.json` — `exports` map: add enumerated `./adapters/{gam,prebid,apstag}` entries plus a `./adapters/*` wildcard fallback
- `build.ts` — rewrite to derive entrypoints from `package.json` and invoke `Bun.build` with `splitting: true`

**Unchanged:**
- `src/index.ts` — already exports core symbols correctly after #7
- `src/adapters.ts`, `src/registry.ts`, `src/ad-unit.ts`, `src/types.ts`, `src/utils/parse-sizes.ts`
- `tsconfig.json` — `include: ["src"]` already walks the new `src/adapters/` directory for `.d.ts` emission
- `biome.json`, `dev.ts`, `lefthook.yml`

---

## Task 1: Add adapter stub files

**Files:**
- Create: `src/adapters/gam.ts`
- Create: `src/adapters/prebid.ts`
- Create: `src/adapters/apstag.ts`

Three identical stubs reserve the subpath names on disk so subsequent tasks have something to point at.

- [ ] **Step 1: Create `src/adapters/gam.ts`**

```ts
export {};
```

- [ ] **Step 2: Create `src/adapters/prebid.ts`**

```ts
export {};
```

- [ ] **Step 3: Create `src/adapters/apstag.ts`**

```ts
export {};
```

- [ ] **Step 4: Verify lint passes on the new files**

Run: `bun run lint`
Expected: zero warnings, zero errors.

- [ ] **Step 5: Verify `tsc` emits declarations for the new files**

Run: `bun run build:types`
Expected: exit 0.

Inspect that the declarations appeared:

Run: `ls dist/adapters/`
Expected output contains: `apstag.d.ts`, `gam.d.ts`, `prebid.d.ts` (may also contain compiled `.js` from a prior build — ignore).

- [ ] **Step 6: Commit**

```bash
git add src/adapters/gam.ts src/adapters/prebid.ts src/adapters/apstag.ts
git commit -m "feat(adapters): reserve gam/prebid/apstag subpath stubs (issue #8)"
```

---

## Task 2: Add adapter entries to `package.json` exports

**Files:**
- Modify: `package.json`

Add enumerated subpath entries for each adapter plus a wildcard fallback. Order matters for readability but not for Node resolution (Node always prefers exact matches over wildcards).

- [ ] **Step 1: Replace the `exports` block in `package.json`**

Replace the current `exports` block:

```json
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
```

With:

```json
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./adapters/gam": {
      "import": "./dist/adapters/gam.js",
      "types": "./dist/adapters/gam.d.ts"
    },
    "./adapters/prebid": {
      "import": "./dist/adapters/prebid.js",
      "types": "./dist/adapters/prebid.d.ts"
    },
    "./adapters/apstag": {
      "import": "./dist/adapters/apstag.js",
      "types": "./dist/adapters/apstag.d.ts"
    },
    "./adapters/*": {
      "import": "./dist/adapters/*.js",
      "types": "./dist/adapters/*.d.ts"
    }
  },
```

- [ ] **Step 2: Verify the file is still valid JSON**

Run: `bun -e "const p = await Bun.file('./package.json').json(); console.log(Object.keys(p.exports).sort().join(', '))"`
Expected output: `., ./adapters/*, ./adapters/apstag, ./adapters/gam, ./adapters/prebid`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add adapter subpath exports (issue #8)"
```

---

## Task 3: Rewrite `build.ts` for multi-entrypoint with code splitting

**Files:**
- Modify: `build.ts`

Derive entrypoints from `package.json`'s `exports` map (the single source of truth) and pass `splitting: true` to `Bun.build` so shared modules (`src/registry.ts`, `src/ad-unit.ts`) end up in shared chunks rather than being duplicated across adapter bundles. Duplicate inlining would produce two `new AdapterRegistry(...)` instances at runtime — the classic silently-broken singleton — so splitting is mandatory, not an optimization.

- [ ] **Step 1: Replace the entire contents of `build.ts`**

```ts
const pkg = await Bun.file("./package.json").json();

// Enumerated "./adapters/<name>" keys in the exports map drive the build.
// The "./adapters/*" wildcard is for consumer path resolution, not for
// emitting files, so it is filtered out.
const adapterSubpaths = Object.keys(pkg.exports).filter(
  (key: string) => key.startsWith("./adapters/") && !key.includes("*"),
);

const entrypoints = [
  "./src/index.ts",
  ...adapterSubpaths.map((key) => `./src${key.slice(1)}.ts`),
];

const result = await Bun.build({
  entrypoints,
  outdir: "./dist",
  target: "browser",
  format: "esm",
  splitting: true,
  minify: true,
  sourcemap: "inline",
});

if (result.success) {
  console.log(`Built ${result.outputs.length} files:`);
  for (const output of result.outputs) {
    console.log(`  ${output.path}`);
  }
} else {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log.message);
  }
  process.exit(1);
}
```

- [ ] **Step 2: Verify `bun run build:js` succeeds and emits the expected files**

Run: `rm -rf dist && bun run build:js`
Expected: exit 0. Output lists at least four entry-point files (one for core plus three adapters). Bun may additionally emit shared chunk files (hashed names) — that is fine.

Inspect the output:

Run: `ls dist/adapters/`
Expected output contains: `apstag.js`, `gam.js`, `prebid.js` (and possibly `.js.map` siblings).

Run: `ls dist/`
Expected output contains: `index.js` and an `adapters/` directory. May also contain hashed shared chunk files — fine.

- [ ] **Step 3: Verify the full build (JS + types) still works end-to-end**

Run: `bun run build`
Expected: exit 0. `dist/index.d.ts`, `dist/adapters/gam.d.ts`, `dist/adapters/prebid.d.ts`, `dist/adapters/apstag.d.ts` all present.

Spot-check one declaration file:

Run: `cat dist/adapters/gam.d.ts`
Expected: an empty module declaration (just `export {};` or equivalent — reflects the stub).

- [ ] **Step 4: Commit**

```bash
git add build.ts
git commit -m "build: derive entrypoints from package.json exports, enable splitting (issue #8)"
```

---

## Task 4: Add the consumer fixture

**Files:**
- Create: `test/fixtures/core-only-consumer.ts`

Committed fixture that imports only core symbols. Bundling it should never pull in adapter code because no adapter module is reachable from the import graph.

- [ ] **Step 1: Create `test/fixtures/core-only-consumer.ts`**

```ts
import { AdUnit, AdServerRegistry, HeaderBiddingRegistry } from "../../src";

void AdUnit;
void AdServerRegistry;
void HeaderBiddingRegistry;
```

- [ ] **Step 2: Do not commit yet** — the fixture is meaningful only alongside the test that uses it. Continue to Task 5; both files are committed together there.

---

## Task 5: Add `test/build.test.ts` with four tests

**Files:**
- Create: `test/build.test.ts`

Four tests exercise the subpath reservation and tree-shake properties. All are expected to pass after the preceding tasks; any failure indicates a regression in the implementation.

- [ ] **Step 1: Create `test/build.test.ts`**

```ts
import { describe, expect, test } from "bun:test";

async function buildAll() {
  const pkg = await Bun.file("./package.json").json();
  const adapterSubpaths = Object.keys(pkg.exports).filter(
    (key: string) => key.startsWith("./adapters/") && !key.includes("*"),
  );
  const entrypoints = [
    "./src/index.ts",
    ...adapterSubpaths.map((key) => `./src${key.slice(1)}.ts`),
  ];
  return Bun.build({
    entrypoints,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
  });
}

describe("build: subpath exports", () => {
  test("every enumerated adapter subpath has a matching source file", async () => {
    const pkg = await Bun.file("./package.json").json();
    const subpaths = Object.keys(pkg.exports).filter(
      (key: string) => key.startsWith("./adapters/") && !key.includes("*"),
    );
    expect(subpaths.length).toBeGreaterThan(0);
    for (const key of subpaths) {
      const src = `./src${key.slice(1)}.ts`;
      expect(await Bun.file(src).exists()).toBe(true);
    }
  });

  test("Bun.build emits one entry-point per entrypoint", async () => {
    const result = await buildAll();
    expect(result.success).toBe(true);

    const entries = result.outputs.filter((o) => o.kind === "entry-point");
    expect(entries).toHaveLength(4);

    const paths = entries.map((o) => o.path);
    expect(paths.some((p) => p.endsWith("index.js"))).toBe(true);
    expect(paths.some((p) => p.endsWith("adapters/gam.js"))).toBe(true);
    expect(paths.some((p) => p.endsWith("adapters/prebid.js"))).toBe(true);
    expect(paths.some((p) => p.endsWith("adapters/apstag.js"))).toBe(true);
  });

  test("core bundle does not reference adapter subpath chunks", async () => {
    const result = await buildAll();
    expect(result.success).toBe(true);

    const core = result.outputs.find(
      (o) =>
        o.kind === "entry-point" &&
        o.path.endsWith("index.js") &&
        !o.path.includes("adapters/"),
    );
    expect(core).toBeDefined();

    const text = await core!.text();
    expect(text).not.toMatch(/adapters\/(gam|prebid|apstag)/);
  });

  test("consumer bundle importing only core has no adapter code", async () => {
    const result = await Bun.build({
      entrypoints: ["./test/fixtures/core-only-consumer.ts"],
      target: "browser",
      format: "esm",
      minify: true,
    });
    expect(result.success).toBe(true);

    const bundle = await result.outputs[0]!.text();
    for (const name of ["gam", "prebid", "apstag"]) {
      expect(bundle).not.toMatch(new RegExp(`adapters/${name}`));
      expect(bundle).not.toMatch(new RegExp(`"${name}"`));
    }
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `bun test test/build.test.ts`
Expected: four tests pass.

- [ ] **Step 3: Verify the rest of the suite still passes**

Run: `bun test`
Expected: every test (existing + new) passes.

- [ ] **Step 4: Commit the fixture + test together**

```bash
git add test/fixtures/core-only-consumer.ts test/build.test.ts
git commit -m "test: verify subpath build structure and tree-shaking (issue #8)"
```

---

## Task 6: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Clean build**

Run: `rm -rf dist && bun run build`
Expected: exit 0. `dist/` contains `index.js`, `index.d.ts`, `adapters/gam.js`, `adapters/gam.d.ts`, `adapters/prebid.js`, `adapters/prebid.d.ts`, `adapters/apstag.js`, `adapters/apstag.d.ts`. Shared chunk files with hashed names may also appear — expected.

Verify:

Run: `ls dist/adapters/ | sort`
Expected output:

```
apstag.d.ts
apstag.js
gam.d.ts
gam.js
prebid.d.ts
prebid.js
```

- [ ] **Step 2: Run full test suite**

Run: `bun test`
Expected: all tests pass with no regressions in the existing `src/*.test.ts` files.

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: zero warnings, zero errors.

- [ ] **Step 4: Spot-check the core bundle does not contain adapter name strings**

Run: `grep -cE '"(gam|prebid|apstag)"' dist/index.js || true`
Expected: `0` (no matches). The core bundle should not mention any adapter name; any adapter name that appears today would indicate a regression.

- [ ] **Step 5: Spot-check that importing core works without adapters at the dist level**

Create a throwaway probe script:

Run:
```bash
bun -e "const m = await import('./dist/index.js'); console.log(Object.keys(m).sort().join(','));"
```
Expected output includes: `AdServerRegistry,AdUnit,AdUnitLifecycleEvent,AdapterRegistry,BannerPosition,HeaderBiddingRegistry,parseSizes,serializeSizes` (order is alphabetical; type-only exports are erased).

- [ ] **Step 6: Spot-check that an adapter subpath resolves to its own chunk**

Run:
```bash
bun -e "const m = await import('./dist/adapters/gam.js'); console.log(Object.keys(m).length);"
```
Expected output: `0` (empty module today; publishers see `{}`).

- [ ] **Step 7: No commit**

Task 6 is pure verification. No files changed. Do not create an empty commit.

---

## Commit strategy

Per AGENTS.md: small, conventional commits, one per task. Final commit log for this issue should read (top to bottom, most recent first):

1. `test: verify subpath build structure and tree-shaking (issue #8)`
2. `build: derive entrypoints from package.json exports, enable splitting (issue #8)`
3. `feat: add adapter subpath exports (issue #8)`
4. `feat(adapters): reserve gam/prebid/apstag subpath stubs (issue #8)`
5. `docs: add subpath exports design spec (issue #8)` *(already landed)*
