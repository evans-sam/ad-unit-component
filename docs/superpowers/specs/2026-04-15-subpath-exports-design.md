# Subpath exports for adapters

> Design spec for [issue #8](https://github.com/evans-sam/ad-unit-component/issues/8)

## Summary

Make each vendor adapter a first-class ES module subpath of `@ad-unit/core`. Publishers import core on its own (`import { AdUnit, AdServerRegistry } from "@ad-unit/core"`) and opt into adapters individually (`import { GamAdapter } from "@ad-unit/core/adapters/gam"`). Core and adapters ship as separate bundles so bundlers can drop unused adapter code without configuration gymnastics.

Scope of this issue: reserve the adapter subpaths, wire the build to emit one chunk per subpath, preserve registry singleton identity across chunks, and guard the tree-shake property with an automated test. Adapter implementations themselves (GAM, Prebid, apstag) land in their own issues (#10 / #11 / #12).

## Motivation

The parent PRD ("Ad Unit Component v1", project [evans-sam/projects/4](https://github.com/users/evans-sam/projects/4) README) states that publishers should only pay for adapters they use. User story 18 in that PRD calls out tree-shakeable ESM imports as the delivery mechanism. Today the package ships a single `dist/index.js` — every consumer gets the full module graph regardless of which exports they touch, and there is no published path for adapter code at all.

Issue #7 (merged) already put the adapter contracts and registries in place:

```ts
export { AdapterRegistry, AdServerRegistry, HeaderBiddingRegistry } from "./registry";
export type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters";
```

Those exports stay. This issue adds the delivery-shape piece: separate subpath entrypoints so the adapters that follow (#10 / #11 / #12) can be imported without pulling in their siblings.

The `AdBid` / Prebid exports called out in the issue text no longer exist — `7b64c0b` and `8e35acf` already removed them. That bullet is treated as already satisfied.

## Public API

### Import shapes

```ts
// Core: <ad-unit> element + registries + interfaces + utilities
import {
  AdUnit,
  AdUnitLifecycleEvent,
  type AdUnitLifecycleDetail,
  AdapterRegistry,
  AdServerRegistry,
  HeaderBiddingRegistry,
  type AdServerAdapter,
  type HeaderBiddingAdapter,
  type BannerFormat,
  type BannerMediaType,
  BannerPosition,
  type MediaTypes,
  parseSizes,
  serializeSizes,
} from "@ad-unit/core";

// Adapters — each reserved path returns an empty module today.
// Implementations land in #10 (GAM), #11 (Prebid), #12 (apstag).
import {} from "@ad-unit/core/adapters/gam";
import {} from "@ad-unit/core/adapters/prebid";
import {} from "@ad-unit/core/adapters/apstag";
```

No changes to the symbols exported from `@ad-unit/core`. `src/index.ts` stays as-is.

### `package.json` exports

```json
{
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
  }
}
```

Enumerated entries give explicit resolution (and IDE completion) for the three reserved adapter names. The wildcard is a defensive fallback for any additional adapter that lands in `src/adapters/` — the build will emit a matching file as soon as one exists.

`"main"`, `"module"`, `"types"`, and `"files"` stay at their current values; they are still referenced by older tooling and `files: ["dist"]` already ships the `dist/adapters/` directory.

### Stub shape

```ts
// src/adapters/gam.ts (and prebid.ts, apstag.ts)
export {};
```

Each stub is an empty ES module. This is the minimum footprint that reserves the subpath: the build has something to point at, `tsc` emits a `.d.ts`, and consumers who import the path get `{}`. When the real adapter lands, the file is rewritten in place — no exports-map churn.

## Internal implementation

### `src/adapters/` directory

Three new files, each containing exactly:

```ts
export {};
```

The `src/adapters.ts` file added in #7 stays — it holds the two interface declarations (`AdServerAdapter`, `HeaderBiddingAdapter`). The new `src/adapters/` directory is distinct from that single-file module. Both can coexist; TypeScript resolves `./adapters` to the file and `./adapters/gam` to the directory file.

### `build.ts`

Multi-entrypoint Bun build with code splitting, driven by the package's own exports map:

```ts
const pkg = await Bun.file("./package.json").json();

// Enumerated adapter subpaths drive the build. The "./adapters/*" wildcard
// exists for consumer resolution, not for emitting files — skip it here.
const adapterSubpaths = Object.keys(pkg.exports).filter(
  (key) => key.startsWith("./adapters/") && !key.includes("*"),
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

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) console.error(log.message);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} files:`);
for (const output of result.outputs) console.log(`  ${output.path}`);
```

Three design notes:

1. **`splitting: true` is non-optional.** Adapters import the module-scoped registry singletons from core. Without splitting, each adapter bundle inlines its own copy of `registry.ts`; the `new AdapterRegistry<...>(...)` call runs per bundle; `AdServerRegistry` inside the adapter bundle is a *different instance* than the one exported from core. Publishers register in one and the ad-unit reads from another — silent breakage. With splitting, the shared module is extracted into a chunk that both entries import, so there is exactly one runtime registry per page.
2. **`package.json` as the single source of truth.** `exports` already enumerates every subpath that ships publicly. Deriving the build entry list from it means adding a new adapter is one edit (create file + add exports entry) instead of two (also update build.ts). The wildcard entry is filtered out — it is a consumer-resolution affordance, not a build instruction.
3. **`tsc --emitDeclarationOnly` is unchanged.** The existing `build:types` script reads `tsconfig.json`'s `include: ["src"]` and walks the entire source tree. Dropping files in `src/adapters/` causes `dist/adapters/*.d.ts` to appear on the next build; no config change required.

### `package.json` changes

Only the `exports` field changes, per the shape in Public API above. No change to scripts, `"main"`, `"files"`, `"module"`, or `"types"`.

### `src/index.ts`

Unchanged. The core entry already exports every symbol listed under "Import shapes" (verified in the current tree).

## Testing

`test/build.test.ts` — new file at the repo root's `test/` directory (separate from `src/` unit tests; avoids conflation with per-module tests). Runs under `bun test`.

`test/fixtures/core-only-consumer.ts` — committed fixture imported by one of the tests.

```ts
// test/fixtures/core-only-consumer.ts
import { AdUnit, AdServerRegistry, HeaderBiddingRegistry } from "../../src";
void AdUnit;
void AdServerRegistry;
void HeaderBiddingRegistry;
```

Coverage:

1. **Every enumerated adapter subpath has a matching source file.** Reads `package.json` exports, filters for `./adapters/<name>`, asserts `./src/adapters/<name>.ts` exists. Catches the "added an entry but forgot the file" mistake at test time instead of build time.
2. **Bun.build emits one entry-point per entrypoint.** Runs the build in memory (no `outdir`), filters `result.outputs` where `kind === "entry-point"`, asserts the four expected paths (`./index.js`, `./adapters/gam.js`, `./adapters/prebid.js`, `./adapters/apstag.js`).
3. **Core bundle does not reference adapter subpath chunks.** Reads the core entry-point output text; asserts no `adapters/(gam|prebid|apstag)` path string appears. With `splitting: true` the core chunk may import a shared chunk — that is fine; the test rejects direct references to the *adapter* subpath outputs only.
4. **Consumer bundle importing only core has no adapter code.** Builds the `test/fixtures/core-only-consumer.ts` fixture through `Bun.build`, reads the output, asserts that neither the path strings `adapters/gam|prebid|apstag` nor the name-string literals `"gam"|"prebid"|"apstag"` appear. Today the stubs are empty so this passes trivially; the assertion becomes meaningful once #10 / #11 / #12 land real adapter code — a name like `name: "gam"` in the adapter definition would appear in the bundle if the module were pulled in, and the test would fail.

Type declarations are covered by the existing `bun run build:types` step. `tsc --emitDeclarationOnly` walks all of `src/**/*.ts`, so `dist/adapters/gam.d.ts` and siblings appear without additional configuration. A green CI run of `bun run build` is the proof.

## Out of scope

- **Per-module tree-shaking inside core.** Bundling everything into a single `dist/index.js` means a consumer who only touches `parseSizes` still downloads `AdUnit` and the registries. Fixing that requires per-module ESM emission plus a careful `sideEffects` declaration (because `src/ad-unit.ts` calls `customElements.define(...)` at module top level). Tracked separately.
- **Actual adapter implementations.** The three stubs exist only to reserve their subpaths. GAM (#10), Prebid (#11), and apstag (#12) each own their own implementation issue.
- **A `sideEffects` declaration in `package.json`.** `"sideEffects": false` is wrong because `src/ad-unit.ts` has a real module-level side effect (`customElements.define`). A precise list is possible but only helps once core is emitted per-module, which is out of scope as above.
- **A demo scenario that loads an adapter from its subpath.** The current demo uses `demo/mock-adapter.ts` directly; a subpath-consuming demo belongs with the first real adapter shipping in #10.
- **Publish-time smoke test for subpath resolution.** The publish workflow runs `bun run build`; whether `node -e 'require("@ad-unit/core/adapters/gam")'` works after `npm install` is a separate CI task if we decide it is worth it.
- **Deprecating `"main"` / `"module"` fields.** Modern resolvers prefer `exports`; older toolchains still read the legacy fields. Leave them in place.

## Further notes

- Bun's `splitting: true` is a Bun-native code-splitting feature; the emitted chunk layout may not exactly match Rollup or esbuild output. That is fine — the `exports` map resolves to the entry-point files we name (`dist/index.js`, `dist/adapters/*.js`), and shared chunks are referenced by those files as hashed siblings. Consumer bundlers follow ESM import graphs and do not care about the chunk filename shape.
- Adding a fourth adapter (say `ix`, `magnite`) is: drop `src/adapters/ix.ts` with an initial stub, add `"./adapters/ix"` to the exports map, add the test assertion. The build, the type emission, and the tree-shake test pick it up with no further changes.
- The tree-shake test uses in-memory `Bun.build` calls rather than depending on `dist/` artifacts from a prior `bun run build`. Running `bun test` in isolation is enough; no pre-test build step required.
