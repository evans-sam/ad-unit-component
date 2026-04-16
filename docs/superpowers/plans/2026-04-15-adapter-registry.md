# Adapter Registry & Interfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `AdServerRegistry` and `HeaderBiddingRegistry` (module-scoped singletons) backed by a generic `AdapterRegistry<T>` class, and export `AdServerAdapter` / `HeaderBiddingAdapter` TypeScript interfaces. Refactor `demo/mock-adapter.ts` to implement `HeaderBiddingAdapter` and wire the registry into demo scenarios.

**Architecture:** Two interfaces (`AdServerAdapter`, `HeaderBiddingAdapter`) with identical shape — `readonly name`, `init(config?: unknown)`, `destroy()` — declared with method syntax so TypeScript bivariance lets concrete adapters narrow `init(config: SomeConfig)`. A single `AdapterRegistry<T>` class backs both registries with `register(name, adapter)` / `get(name)` / `getAll()`. Duplicate `register()` emits `console.warn` and overwrites. `getAll()` returns a fresh `Map` snapshot.

**Tech Stack:** TypeScript, `bun:test` for unit tests (no DOM needed for the registry itself). Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-04-15-adapter-registry-design.md`

---

## File Structure

**New files:**
- `src/adapters.ts` — two exported interfaces (`AdServerAdapter`, `HeaderBiddingAdapter`)
- `src/registry.ts` — `AdapterRegistry<T>` class + `AdServerRegistry` + `HeaderBiddingRegistry` singletons
- `src/registry.test.ts` — behavior coverage

**Modified files:**
- `src/index.ts` — re-export class, singletons, interfaces
- `demo/mock-adapter.ts` — rename returned shape `{ start, stop }` → `{ name, init, destroy }`, conform to `HeaderBiddingAdapter`
- `demo/scenarios/lifecycle.ts`, `demo/scenarios/viewport.ts`, `demo/scenarios/blocking.ts`, `demo/scenarios/refresh.ts` — update call sites that use the mock adapter

**Unchanged:**
- `src/ad-unit.ts`, `src/types.ts`, `src/utils/parse-sizes.ts`, `build.ts`, `tsconfig.json`, `biome.json`

---

## Task 1: Add adapter interfaces (`src/adapters.ts`)

**Files:**
- Create: `src/adapters.ts`

Minimal module with two exported interfaces. No runtime code.

- [ ] **Step 1: Create `src/adapters.ts`**

```ts
/**
 * Contract for header bidding adapters (Prebid, apstag, etc.).
 *
 * Implementers subscribe to `<ad-unit>` lifecycle events (typically via
 * `document.addEventListener`) and coordinate auction state. The interface
 * deliberately does not prescribe event wiring — that is the adapter's
 * concern. It exists so publishers have a consistent activation shape and
 * TypeScript consumers get autocompletion.
 */
export interface HeaderBiddingAdapter {
  readonly name: string;
  init(config?: unknown): void | Promise<void>;
  destroy(): void | Promise<void>;
}

/**
 * Contract for ad server adapters (GAM, etc.).
 *
 * Structurally identical to `HeaderBiddingAdapter` today. Kept as a distinct
 * type so the two roles can diverge without a breaking change (e.g. ad
 * server adapters may later add a `setTargeting()` method referenced in the
 * parent PRD).
 */
export interface AdServerAdapter {
  readonly name: string;
  init(config?: unknown): void | Promise<void>;
  destroy(): void | Promise<void>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run build
```

Expected: no type errors.

---

## Task 2: Add `AdapterRegistry` class and singletons (`src/registry.ts`)

**Files:**
- Create: `src/registry.ts`

Generic class backed by a `Map<string, T>`, with two module-scoped instances exported.

- [ ] **Step 1: Create `src/registry.ts`**

```ts
import type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters";

export class AdapterRegistry<T extends { readonly name: string }> {
  readonly #label: string;
  readonly #adapters = new Map<string, T>();

  constructor(label: string) {
    this.#label = label;
  }

  register(name: string, adapter: T): void {
    if (this.#adapters.has(name)) {
      console.warn(
        `[${this.#label}] adapter "${name}" already registered; overwriting`,
      );
    }
    this.#adapters.set(name, adapter);
  }

  get(name: string): T | undefined {
    return this.#adapters.get(name);
  }

  getAll(): Map<string, T> {
    return new Map(this.#adapters);
  }
}

export const AdServerRegistry = new AdapterRegistry<AdServerAdapter>(
  "AdServerRegistry",
);
export const HeaderBiddingRegistry = new AdapterRegistry<HeaderBiddingAdapter>(
  "HeaderBiddingRegistry",
);
```

Uses native `#private` (per AGENTS.md). No comments describing WHAT — the code is self-explanatory.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run build
```

Expected: no type errors.

---

## Task 3: Add registry behavior tests (`src/registry.test.ts`)

**Files:**
- Create: `src/registry.test.ts`

Seven test cases covering the full public API. Style mirrors `src/ad-unit.test.ts`.

- [ ] **Step 1: Create `src/registry.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters";
import {
  AdapterRegistry,
  AdServerRegistry,
  HeaderBiddingRegistry,
} from "./registry";

function makeAdapter(name: string): HeaderBiddingAdapter {
  return {
    name,
    init() {},
    destroy() {},
  };
}

describe("AdapterRegistry", () => {
  test("register() stores an adapter retrievable via get()", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    const adapter = makeAdapter("prebid");
    registry.register("prebid", adapter);
    expect(registry.get("prebid")).toBe(adapter);
  });

  test("get() returns undefined for unknown name", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    expect(registry.get("unknown")).toBeUndefined();
  });

  test("getAll() returns all registered adapters in insertion order", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    const prebid = makeAdapter("prebid");
    const apstag = makeAdapter("apstag");
    registry.register("prebid", prebid);
    registry.register("apstag", apstag);
    const all = registry.getAll();
    expect(Array.from(all.keys())).toEqual(["prebid", "apstag"]);
    expect(all.get("prebid")).toBe(prebid);
    expect(all.get("apstag")).toBe(apstag);
  });

  test("getAll() returns a snapshot — mutating it does not affect the registry", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    const adapter = makeAdapter("prebid");
    registry.register("prebid", adapter);
    const snapshot = registry.getAll();
    snapshot.delete("prebid");
    snapshot.set("fake", makeAdapter("fake"));
    expect(registry.get("prebid")).toBe(adapter);
    expect(registry.get("fake")).toBeUndefined();
  });

  describe("duplicate registration", () => {
    let warnSpy: ReturnType<typeof spyOn<Console, "warn">>;

    beforeEach(() => {
      warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test("warns via console.warn with registry label and adapter name", () => {
      const registry = new AdapterRegistry<HeaderBiddingAdapter>("MyRegistry");
      registry.register("prebid", makeAdapter("prebid"));
      registry.register("prebid", makeAdapter("prebid"));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain("MyRegistry");
      expect(message).toContain("prebid");
    });

    test("overwrites — get() returns the later adapter", () => {
      const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
      const first = makeAdapter("prebid");
      const second = makeAdapter("prebid");
      registry.register("prebid", first);
      registry.register("prebid", second);
      expect(registry.get("prebid")).toBe(second);
    });
  });
});

describe("module singletons", () => {
  afterEach(() => {
    // Singletons are process-scoped; reset them so tests don't leak state.
    for (const name of AdServerRegistry.getAll().keys()) {
      // No public unregister; instantiate fresh maps by clearing via
      // re-registration is the wrong shape. Instead, leverage the fact that
      // each singleton's #adapters Map persists — we only need isolation
      // from each other, tested below. No cross-test cleanup required for
      // the singleton-independence test.
      void name;
    }
  });

  test("AdServerRegistry and HeaderBiddingRegistry are independent", () => {
    const adServer: AdServerAdapter = {
      name: "gam-test",
      init() {},
      destroy() {},
    };
    const headerBidder: HeaderBiddingAdapter = {
      name: "prebid-test",
      init() {},
      destroy() {},
    };
    AdServerRegistry.register("gam-test", adServer);
    HeaderBiddingRegistry.register("prebid-test", headerBidder);
    expect(AdServerRegistry.get("gam-test")).toBe(adServer);
    expect(AdServerRegistry.get("prebid-test")).toBeUndefined();
    expect(HeaderBiddingRegistry.get("prebid-test")).toBe(headerBidder);
    expect(HeaderBiddingRegistry.get("gam-test")).toBeUndefined();
  });
});

describe("TypeScript bivariance (compile-time check)", () => {
  test("concrete adapter with narrowed init() signature is assignable", () => {
    interface PrebidConfig {
      units: Record<string, unknown>;
    }

    const PrebidAdapter: HeaderBiddingAdapter = {
      name: "prebid",
      init(config: PrebidConfig = { units: {} }) {
        void config;
      },
      destroy() {},
    };

    // This line exists primarily as a compile-time check; method bivariance
    // lets us narrow `init`'s parameter from `unknown` to `PrebidConfig`.
    HeaderBiddingRegistry.register("prebid-bivariance-test", PrebidAdapter);
    expect(HeaderBiddingRegistry.get("prebid-bivariance-test")).toBe(
      PrebidAdapter,
    );
  });
});
```

- [ ] **Step 2: Run tests**

```bash
bun test src/registry.test.ts
```

Expected: all tests pass.

---

## Task 4: Export registries and interfaces from package root (`src/index.ts`)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add exports to `src/index.ts`**

Append two new export statements. Preserve existing exports exactly.

New lines:

```ts
export {
  AdapterRegistry,
  AdServerRegistry,
  HeaderBiddingRegistry,
} from "./registry";
export type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters";
```

- [ ] **Step 2: Verify build produces correct `.d.ts`**

```bash
bun run build
```

Inspect `dist/index.d.ts` — expect five new exports: `AdapterRegistry` (class), `AdServerRegistry` (instance), `HeaderBiddingRegistry` (instance), `AdServerAdapter` (type), `HeaderBiddingAdapter` (type).

---

## Task 5: Refactor `demo/mock-adapter.ts` to implement `HeaderBiddingAdapter`

**Files:**
- Modify: `demo/mock-adapter.ts`

- [ ] **Step 1: Update imports**

Add `HeaderBiddingAdapter` to the `../src` type import:

```ts
import type {
  AdUnitLifecycleEvent,
  BannerFormat,
  HeaderBiddingAdapter,
} from "../src";
```

- [ ] **Step 2: Remove the local `MockAdapter` interface**

Delete the `export interface MockAdapter { start(): void; stop(): void; }` block.

- [ ] **Step 3: Update factory return type and returned object**

Change the factory's declared return type from `MockAdapter` to `HeaderBiddingAdapter`.

Change the returned object from:

```ts
return {
  start() { ... },
  stop() { ... },
};
```

to:

```ts
return {
  name: "mock",
  init() { ... },  // body identical to old start()
  destroy() { ... },  // body identical to old stop()
};
```

`init()`'s optional `config` parameter is accepted implicitly via the interface — the body does nothing with it, so no parameter declaration is required.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun run build
```

Expected: no type errors.

---

## Task 6: Update demo scenarios that call the mock adapter

**Files:**
- Modify: `demo/scenarios/lifecycle.ts`, `demo/scenarios/viewport.ts`, `demo/scenarios/blocking.ts`, `demo/scenarios/refresh.ts` (only the files that actually instantiate the mock adapter)

- [ ] **Step 1: Identify files calling `createMockAdapter`**

```bash
grep -l "createMockAdapter" demo/scenarios/
```

- [ ] **Step 2: Update each call site**

Replace:

```ts
const adapter = createMockAdapter();
adapter.start();
```

With:

```ts
const adapter = createMockAdapter();
HeaderBiddingRegistry.register(adapter.name, adapter);
adapter.init();
```

Replace `adapter.stop()` with `adapter.destroy()`.

Add the `HeaderBiddingRegistry` import from `../../src`.

- [ ] **Step 3: Verify demo runs**

```bash
bun run dev
```

Open each scenario page in a browser (or use the dev server URL routes). Confirm:

1. Lifecycle events still trigger mock ad placards (pending → rendered states)
2. Viewport scenario: lazy-loaded units still hit `init` → fetch handler → rendered placard on scroll
3. Blocking scenario: `waitUntil` delays still visible
4. Refresh scenario: refresh cycles re-paint placards with incrementing `refreshCount`

Same behavior as before the refactor.

---

## Task 7: Run full verification

**Files:** none modified

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: all tests pass. No regressions in existing `src/ad-unit.test.ts` or `src/utils/parse-sizes.test.ts`.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: zero new warnings or errors.

- [ ] **Step 3: Run build**

```bash
bun run build
```

Expected: `dist/index.js` and `dist/index.d.ts` emitted without error. Inspect `dist/index.d.ts` and confirm the new public API is present.

- [ ] **Step 4: Manual smoke in demo**

```bash
bun run dev
```

In the demo page's DevTools console:

```js
import("/src/index.ts").then((m) => {
  console.log(m.HeaderBiddingRegistry.getAll());     // Map with at least "mock"
  console.log(m.HeaderBiddingRegistry.get("mock"));  // the adapter object
  m.HeaderBiddingRegistry.register(
    "mock",
    m.HeaderBiddingRegistry.get("mock"),
  );
  // Expect a console.warn:
  // [HeaderBiddingRegistry] adapter "mock" already registered; overwriting
});
```

---

## Commit strategy

Per AGENTS.md: small + conventional commits, one per task group.

1. `docs: add adapter registry design spec (issue #7)` — the spec and plan files committed together
2. `feat: add AdapterRegistry and adapter interfaces (issue #7)` — `src/adapters.ts`, `src/registry.ts`, `src/registry.test.ts`, `src/index.ts`
3. `refactor: update mock-adapter to implement HeaderBiddingAdapter (issue #7)` — `demo/mock-adapter.ts` and any affected demo scenario files
