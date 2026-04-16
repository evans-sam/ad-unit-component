# Adapter registries and TypeScript interfaces

> Design spec for [issue #7](https://github.com/evans-sam/ad-unit-component/issues/7)

## Summary

Add two module-scoped singleton registries — `AdServerRegistry` and `HeaderBiddingRegistry` — backed by a shared generic `AdapterRegistry<T>` class, and export two TypeScript interfaces — `AdServerAdapter` and `HeaderBiddingAdapter` — that adapters implement. Registry API is `register(name, adapter)` / `get(name)` / `getAll()`. Duplicate registration warns via `console.warn` and overwrites. The interfaces require `name`, `init()`, and `destroy()` at minimum; they do **not** prescribe which lifecycle events an adapter listens to.

This is the extension point for community adapters and unblocks the v1 adapter implementations tracked in issues #10 (GAM), #11 (Prebid), and #12 (apstag).

## Motivation

The parent PRD ("Ad Unit Component v1", attached to GitHub project [evans-sam/projects/4](https://github.com/users/evans-sam/projects/4) as the project README) establishes a global-registry pattern for vendor-specific adapter registration:

```ts
AdServerRegistry.register("gam", GamAdapter);
HeaderBiddingRegistry.register("prebid", PrebidAdapter);
HeaderBiddingRegistry.register("apstag", ApstaAdapter);
```

The PRD's "Adapter Architecture" section also specifies the exact registry API: `register(name, adapter) / get(name) / getAll()` returning a `Map<string, Adapter>`, with duplicate registration overwriting rather than throwing. That accommodates dev-time hot-reload scenarios without failing loud in production.

User stories addressed:

- **16** — "build a custom adapter for my header bidding framework"
- **17** — "build a custom ad server adapter"
- **19** — "TypeScript type definitions for the component, adapters, and registry"
- **20** — "clear adapter interfaces documented and exported"
- **23** — "adapters registered via a global registry"

The current codebase has no registry. `demo/mock-adapter.ts` shows the informal adapter pattern — a factory returning `{ start(), stop() }` that adds document-level listeners to lifecycle events. This issue formalizes that shape into a typed contract.

## Public API

### Registries

Exported from the package root:

```ts
export const AdServerRegistry: AdapterRegistry<AdServerAdapter>;
export const HeaderBiddingRegistry: AdapterRegistry<HeaderBiddingAdapter>;
```

Both are module-scoped singletons. Publishers import and use them directly — no construction required:

```ts
import { HeaderBiddingRegistry } from "ad-unit-component";
HeaderBiddingRegistry.register("prebid", PrebidAdapter);
```

### `AdapterRegistry<T>` class

Exported so the ecosystem can create additional registries if a new adapter category arises (e.g. analytics adapters, refresh policy adapters):

```ts
export class AdapterRegistry<T extends { readonly name: string }> {
  constructor(label: string);
  register(name: string, adapter: T): void;
  get(name: string): T | undefined;
  getAll(): Map<string, T>;
}
```

- `label` — identifier shown in the duplicate-registration warning (e.g. `"AdServerRegistry"`).
- The `T extends { readonly name: string }` constraint keeps the registry consistent with the interface contract without forcing a specific adapter shape.

### `register(name, adapter)`

Stores `adapter` under `name`. If `name` is already registered, emits a single `console.warn` and overwrites:

```
[AdServerRegistry] adapter "gam" already registered; overwriting
```

Returns `void`. Duplicate detection uses `Map.has()`, so names are case-sensitive and must match exactly. The warn-and-overwrite behavior supports dev-time hot-reload — a module that re-executes its top-level `register(...)` call should not throw.

### `get(name)`

Returns the stored adapter or `undefined` for an unknown name. Pure lookup — no side effects.

### `getAll()`

Returns a **snapshot copy** of the internal map:

```ts
const snapshot = HeaderBiddingRegistry.getAll();
snapshot.delete("prebid");            // does NOT mutate the registry
HeaderBiddingRegistry.get("prebid");  // still returns the adapter
```

Returning a copy (`new Map(this.#adapters)`) prevents consumer mutations from corrupting registry state. Ordering is Map insertion order (per the ECMAScript `Map` spec).

### Adapter interfaces

```ts
export interface HeaderBiddingAdapter {
  readonly name: string;
  init(config?: unknown): void | Promise<void>;
  destroy(): void | Promise<void>;
}

export interface AdServerAdapter {
  readonly name: string;
  init(config?: unknown): void | Promise<void>;
  destroy(): void | Promise<void>;
}
```

Three design notes:

1. **Method syntax (`init(...)`, not `init: (...) => ...`).** TypeScript checks method signatures **bivariantly** regardless of `strictFunctionTypes`. That is what lets concrete adapters declare a narrower `init(config: PrebidConfig): void` and still be structurally assignable to `HeaderBiddingAdapter`. Publishers calling `PrebidAdapter.init(prebidConfig)` get full type checking.
2. **Two separate interfaces, not a shared alias.** Structurally identical today, but the PRD's "Ad Server Adapter Interface" section anticipates divergence — ad server adapters own render/targeting/refresh concerns that header bidding adapters don't. Keeping them distinct lets those methods land without a breaking type-rename.
3. **`void | Promise<void>` return type.** Adapters are free to be synchronous or to `await` script loading inside `init()` / network teardown inside `destroy()`. Consumers can `await adapter.init(config)` if they care about completion.

The interfaces explicitly do **not** prescribe:

- Which lifecycle events to listen to (that's the adapter's concern — see `demo/mock-adapter.ts` for the `ad-unit:fetch` + `ad-unit:render` + `ad-unit:disconnected` listener pattern)
- How `init()` discovers config (can be positional, object-form, or from a separate `configure()` method — adapter-specific)
- How state is stored internally (module closures vs class instances vs Maps — adapter's call)

Interfaces exist **only** for type safety and discoverability.

## Internal implementation

### `src/adapters.ts`

Module contains only the two exported interface declarations (about 15 lines including JSDoc). Kept separate from `src/registry.ts` so community adapter authors have one obvious place to look when implementing a new adapter.

### `src/registry.ts`

Single class with two singleton instantiations:

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

Uses native `#private` fields rather than TypeScript `private`, per AGENTS.md. The `T extends { readonly name: string }` generic constraint is not strictly required by the three methods, but encodes the registry contract at the type system: everything you put in has a `name`.

### `src/index.ts`

Add:

```ts
export {
  AdapterRegistry,
  AdServerRegistry,
  HeaderBiddingRegistry,
} from "./registry";
export type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters";
```

Existing exports stay unchanged.

### `demo/mock-adapter.ts` refactor

The current factory returns `{ start(), stop() }`. Rename to implement `HeaderBiddingAdapter`:

```ts
// Before:
export interface MockAdapter { start(): void; stop(): void; }
export function createMockAdapter(options?): MockAdapter { ... }

// After:
import type { HeaderBiddingAdapter } from "../src";
export function createMockAdapter(options?: MockAdapterOptions): HeaderBiddingAdapter { ... }
```

Body change is a rename:

- `start()` → `init(config?: unknown)` — body identical (attaches three document listeners, flips `started` flag). `config` arg is accepted and ignored; factory options already populated the construction-time config path.
- `stop()` → `destroy()` — body identical (removes the three document listeners, clears pending auctions, flips `started` flag).
- Returned object gains a `name: "mock"` field.
- Local `MockAdapter` interface is deleted.

### Demo scenario call-site updates

Scenarios that instantiate the mock adapter update their wiring:

```ts
// Before:
const adapter = createMockAdapter();
adapter.start();
// ... later
adapter.stop();

// After:
import { HeaderBiddingRegistry } from "../../src";
const adapter = createMockAdapter();
HeaderBiddingRegistry.register(adapter.name, adapter);
adapter.init();
// ... later (e.g. scenario cleanup)
adapter.destroy();
```

Files touched: any of `demo/scenarios/lifecycle.ts`, `demo/scenarios/viewport.ts`, `demo/scenarios/blocking.ts`, `demo/scenarios/refresh.ts` that call `createMockAdapter`.

## Testing

`src/registry.test.ts` — `bun:test`, no DOM needed (registry is plain ES code). Style mirrors `src/ad-unit.test.ts`: per-field assertions, small focused tests, shared fixtures declared at the top.

Coverage:

1. `register()` stores the adapter; `get(name)` returns it
2. `get()` on unknown name returns `undefined`
3. `getAll()` returns every registered adapter in insertion order
4. `getAll()` returns a snapshot copy — mutating the returned map does not affect the registry
5. Duplicate `register()` emits `console.warn` (asserted via `spyOn(console, "warn")`); message includes both the registry label and the adapter name
6. Duplicate `register()` overwrites — `get()` returns the most recently registered adapter
7. `AdServerRegistry` and `HeaderBiddingRegistry` singletons are independent — registering in one does not leak to the other

Each functional test constructs a fresh `new AdapterRegistry<SomeAdapter>("test")` for isolation. The singleton-independence test (#7) uses the exported `AdServerRegistry` / `HeaderBiddingRegistry` and resets them explicitly in `afterEach` (since they are process-scoped).

The TypeScript bivariance property (concrete adapters narrowing `init()`) is verified by the test file itself compiling — a deliberately typed `const adapter: HeaderBiddingAdapter = { name: "prebid", init(cfg: { units: Record<string, unknown> }) { ... }, destroy() {} }` sits in the test file as a compile-time check.

## Out of scope

- **`demo/scenarios/registry.html`** — a follow-up scenario that shows register/get/getAll and the "already registered" warning visually. Mentioned as a stub in `plans/demo-test-harness.md`; its own issue.
- **Subpath exports** (`ad-unit-component/adapters/gam` etc.) — PRD Phase 4, tracked separately.
- **Adapter implementations** — GAM (#10), Prebid (#11), apstag (#12) are each their own issue.
- **`unregister(name)` method** — not in the issue or PRD. The hot-reload case is covered by overwrite-via-duplicate-register. If a real need for explicit removal emerges, it can be added without breaking the current API.
- **Registry events** (e.g. an `onRegister` hook) — not required and not in the PRD.
- **Ordered / typed dispatch across multiple adapters** — the registry does not coordinate event dispatch. Each adapter owns its own `document.addEventListener` wiring, so listener order is determined by the order `init()` is called, which is a publisher concern.

## Further notes

- The registry holds adapter references but does not call `init()` or `destroy()` itself. Activation is the publisher's responsibility, matching the PRD's usage example. This keeps the registry's role narrow — pure name → adapter lookup.
- Because registries are module-level singletons, they are process-scoped. That is the intended design for browser bundles (one copy per page). Server-side rendering is explicitly out of scope for v1 per the PRD.
- A future "refresh adapter" or "analytics adapter" category could reuse `AdapterRegistry<T>` directly — exporting the class costs nothing and avoids a duplicated implementation later.
