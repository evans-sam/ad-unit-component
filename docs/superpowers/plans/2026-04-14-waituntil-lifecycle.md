# waitUntil Lifecycle Coordination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cancelable-event semantics on `<ad-unit>` with a platform-standard `event.waitUntil(promise)` primitive and refactor lazy loading to use the same primitive internally.

**Architecture:** Introduce `AdUnitLifecycleEvent` subclass exposing `waitUntil()`. Chain lifecycle stages (`connected` → `fetch` → `render`) through a sync-until-blocked dispatcher that awaits all pending promises before advancing. Lazy loading becomes a built-in internal listener that calls `event.waitUntil(this.#awaitZone("fetch"))`. Teardown uses an `AbortController` to reject in-flight zone promises.

**Tech Stack:** TypeScript, web components, `IntersectionObserver`, `Promise.all`, `AbortController`, Bun test runner, `@happy-dom/global-registrator`.

**Design spec:** `docs/superpowers/specs/2026-04-14-waituntil-lifecycle-coordination-design.md`

---

## File Structure

- `src/ad-unit.ts` — all code changes land here. Add `AdUnitLifecycleEvent` class, lifecycle stage chain, `#awaitZone` helper, `blocked` property. Remove observer bookkeeping fields.
- `src/ad-unit.test.ts` — add new test groups, update three existing tests affected by the refactor (event flags, observer-count-on-connect, invalid-margin-throws).
- `src/index.ts` — add export for `AdUnitLifecycleEvent`.

No new files. The `AdUnitLifecycleEvent` class lives alongside `AdUnit` in `ad-unit.ts` — it is tightly coupled to the dispatch machinery and small enough to not warrant separation.

---

## Task 1: Add `AdUnitLifecycleEvent` class

**Files:**
- Modify: `src/ad-unit.ts` (add class near the top, above `AdUnit`)
- Test: `src/ad-unit.test.ts` (add new `describe("AdUnitLifecycleEvent", ...)` block at the bottom)

- [ ] **Step 1: Write failing tests**

Append to `src/ad-unit.test.ts` at the very end inside the outermost `describe("AdUnit", ...)` block, before its closing `});`:

```ts
describe("AdUnitLifecycleEvent", () => {
  test("is a CustomEvent subclass", () => {
    const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event).toBeInstanceOf(AdUnitLifecycleEvent);
    expect(event.type).toBe("ad-unit:fetch");
  });

  test("pending starts empty", () => {
    const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
    expect(event.pending).toEqual([]);
  });

  test("waitUntil pushes promise to pending when dispatching", () => {
    const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
    event.beginDispatch();
    const promise = Promise.resolve();
    event.waitUntil(promise);
    expect(event.pending).toHaveLength(1);
    event.endDispatch();
  });

  test("waitUntil wraps non-promise values in Promise.resolve", () => {
    const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
    event.beginDispatch();
    event.waitUntil("not a promise" as unknown as Promise<unknown>);
    expect(event.pending).toHaveLength(1);
    expect(event.pending[0]).toBeInstanceOf(Promise);
    event.endDispatch();
  });

  test("waitUntil throws outside dispatch", () => {
    const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
    expect(() => event.waitUntil(Promise.resolve())).toThrow(
      "waitUntil() must be called during event dispatch",
    );
  });

  test("waitUntil throws after dispatch ends", () => {
    const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
    event.beginDispatch();
    event.endDispatch();
    expect(() => event.waitUntil(Promise.resolve())).toThrow();
  });
});
```

Also add `AdUnitLifecycleEvent` to the imports at the top of `src/ad-unit.test.ts`:

```ts
import { AdUnit, AdUnitLifecycleEvent } from "./ad-unit";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/ad-unit.test.ts`
Expected: fails with `AdUnitLifecycleEvent is not defined` or import error.

- [ ] **Step 3: Implement `AdUnitLifecycleEvent`**

At the top of `src/ad-unit.ts`, just above `/** * AdUnit web component ...` JSDoc, add:

```ts
export interface AdUnitLifecycleDetail {
  code?: string;
  sizes?: number[][];
  gpid?: string | null;
  pos?: number | null;
  format?: BannerFormat[] | null;
  container?: HTMLDivElement;
}

export class AdUnitLifecycleEvent extends CustomEvent<AdUnitLifecycleDetail> {
  #pending: Promise<unknown>[] = [];
  #dispatching = false;

  get pending(): readonly Promise<unknown>[] {
    return this.#pending;
  }

  waitUntil(promise: Promise<unknown>): void {
    if (!this.#dispatching) {
      throw new Error("waitUntil() must be called during event dispatch");
    }
    this.#pending.push(Promise.resolve(promise));
  }

  /** @internal — called by AdUnit before/after dispatchEvent */
  beginDispatch(): void {
    this.#dispatching = true;
  }

  /** @internal */
  endDispatch(): void {
    this.#dispatching = false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts`
Expected: all `AdUnitLifecycleEvent` tests pass. Existing tests continue to pass (no AdUnit changes yet).

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "Add AdUnitLifecycleEvent with waitUntil()"
```

---

## Task 2: Dispatch lifecycle events as `AdUnitLifecycleEvent` (non-cancelable)

**Files:**
- Modify: `src/ad-unit.ts` (refactor `#dispatchLifecycle`)
- Test: `src/ad-unit.test.ts` (update cancelable assertions in existing tests)

- [ ] **Step 1: Update existing tests — flip cancelable expectation**

The tests at `src/ad-unit.test.ts:378-408` and `:673-691` assert `e.cancelable` is `true`. Flip them to `false` and rename the test names accordingly.

At line 378 (`"ad-unit:connected is bubbles, composed, cancelable"`):

```ts
test("ad-unit:connected is bubbles and composed, not cancelable", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  let received: CustomEvent | null = null;
  element.addEventListener("ad-unit:connected", (e) => {
    received = e as CustomEvent;
  });

  container.appendChild(element);

  const e = received as unknown as CustomEvent;
  expect(e.bubbles).toBe(true);
  expect(e.composed).toBe(true);
  expect(e.cancelable).toBe(false);
});
```

At line 393 (`"ad-unit:disconnected is bubbles, composed, cancelable"`):

```ts
test("ad-unit:disconnected is bubbles and composed, not cancelable", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  let received: CustomEvent | null = null;
  element.addEventListener("ad-unit:disconnected", (e) => {
    received = e as CustomEvent;
  });

  container.removeChild(element);

  const e = received as unknown as CustomEvent;
  expect(e.bubbles).toBe(true);
  expect(e.composed).toBe(true);
  expect(e.cancelable).toBe(false);
});
```

At line 673 (`"fetch and render events are bubbles, composed, cancelable"`):

```ts
test("fetch and render events are bubbles and composed, not cancelable", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  const events: CustomEvent[] = [];
  element.addEventListener("ad-unit:fetch", (e) =>
    events.push(e as CustomEvent),
  );
  element.addEventListener("ad-unit:render", (e) =>
    events.push(e as CustomEvent),
  );

  container.appendChild(element);

  expect(events).toHaveLength(2);
  for (const e of events) {
    expect(e.bubbles).toBe(true);
    expect(e.composed).toBe(true);
    expect(e.cancelable).toBe(false);
  }
});
```

Then add a new test in the `"lifecycle events"` describe block (insert after line 408):

```ts
test("lifecycle events are AdUnitLifecycleEvent instances", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  let connectedEvent: Event | null = null;
  let fetchEvent: Event | null = null;
  let renderEvent: Event | null = null;
  element.addEventListener("ad-unit:connected", (e) => {
    connectedEvent = e;
  });
  element.addEventListener("ad-unit:fetch", (e) => {
    fetchEvent = e;
  });
  element.addEventListener("ad-unit:render", (e) => {
    renderEvent = e;
  });

  container.appendChild(element);

  expect(connectedEvent).toBeInstanceOf(AdUnitLifecycleEvent);
  expect(fetchEvent).toBeInstanceOf(AdUnitLifecycleEvent);
  expect(renderEvent).toBeInstanceOf(AdUnitLifecycleEvent);
});
```

- [ ] **Step 2: Run tests — expect the three updated tests to fail (cancelable still `true`) and the new instanceof test to fail**

Run: `bun test src/ad-unit.test.ts`
Expected: four failures (three cancelable flips, one instanceof).

- [ ] **Step 3: Refactor `#dispatchLifecycle`**

In `src/ad-unit.ts`, replace the existing `#dispatchLifecycle` method (currently at lines 333-349) with:

```ts
#dispatchLifecycle(type: string): AdUnitLifecycleEvent {
  const event = new AdUnitLifecycleEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: false,
    detail: {
      code: this.code,
      sizes: this.sizes,
      gpid: this.gpid,
      pos: this.pos,
      format: this.format,
      container: this.container,
    },
  });
  event.beginDispatch();
  this.dispatchEvent(event);
  event.endDispatch();
  return event;
}
```

The method now returns the event so callers can inspect `event.pending`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "Dispatch lifecycle events as AdUnitLifecycleEvent (non-cancelable)"
```

---

## Task 3: Add sync-until-blocked lifecycle chain (eager mode only)

**Files:**
- Modify: `src/ad-unit.ts` (replace `connectedCallback` branching)
- Test: `src/ad-unit.test.ts` (new describe block for waitUntil behavior)

This task wires the sync-until-blocked dispatcher for eager mode. Lazy mode still uses the existing `#setupObservers` path — the refactor of lazy loading happens in Task 6.

- [ ] **Step 1: Write failing tests**

Add a new `describe("waitUntil (eager mode)", ...)` block at the end of `src/ad-unit.test.ts` (inside the outer `describe("AdUnit", ...)`, before the `AdUnitLifecycleEvent` block):

```ts
describe("waitUntil (eager mode)", () => {
  test("zero waiters: all three events fire synchronously", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    const order: string[] = [];
    element.addEventListener("ad-unit:connected", () => order.push("connected"));
    element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
    element.addEventListener("ad-unit:render", () => order.push("render"));

    container.appendChild(element);

    // All three should have fired synchronously in connectedCallback.
    expect(order).toEqual(["connected", "fetch", "render"]);
  });

  test("waitUntil on connected defers fetch until promise resolves", async () => {
    const element = document.createElement("ad-unit") as AdUnit;
    let resolve: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    let fetchFired = false;
    element.addEventListener("ad-unit:connected", (e) => {
      (e as AdUnitLifecycleEvent).waitUntil(gate);
    });
    element.addEventListener("ad-unit:fetch", () => {
      fetchFired = true;
    });

    container.appendChild(element);
    expect(fetchFired).toBe(false); // async path

    resolve!();
    await gate;
    await Promise.resolve(); // let chained then run

    expect(fetchFired).toBe(true);
  });

  test("waitUntil on fetch defers render until promise resolves", async () => {
    const element = document.createElement("ad-unit") as AdUnit;
    let resolve: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    let renderFired = false;
    element.addEventListener("ad-unit:fetch", (e) => {
      (e as AdUnitLifecycleEvent).waitUntil(gate);
    });
    element.addEventListener("ad-unit:render", () => {
      renderFired = true;
    });

    container.appendChild(element);
    expect(renderFired).toBe(false);

    resolve!();
    await gate;
    await Promise.resolve();

    expect(renderFired).toBe(true);
  });

  test("multiple waitUntil calls compose (Promise.all semantics)", async () => {
    const element = document.createElement("ad-unit") as AdUnit;
    let resolveA: () => void;
    let resolveB: () => void;
    const gateA = new Promise<void>((r) => {
      resolveA = r;
    });
    const gateB = new Promise<void>((r) => {
      resolveB = r;
    });

    let renderFired = false;
    element.addEventListener("ad-unit:fetch", (e) => {
      (e as AdUnitLifecycleEvent).waitUntil(gateA);
    });
    element.addEventListener("ad-unit:fetch", (e) => {
      (e as AdUnitLifecycleEvent).waitUntil(gateB);
    });
    element.addEventListener("ad-unit:render", () => {
      renderFired = true;
    });

    container.appendChild(element);

    resolveA!();
    await gateA;
    await Promise.resolve();
    expect(renderFired).toBe(false); // B still pending

    resolveB!();
    await gateB;
    await Promise.resolve();
    expect(renderFired).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/ad-unit.test.ts`
Expected: the `waitUntil (eager mode)` tests fail because the current implementation ignores `waitUntil` and fires all events synchronously regardless.

- [ ] **Step 3: Implement the sync-until-blocked chain**

In `src/ad-unit.ts`, add a private field to `AdUnit`:

```ts
#aborted = false;
```

Add this field alongside the existing `#container`, `#fetchObserver`, etc.

Replace the existing `connectedCallback` (currently at lines 235-245) with:

```ts
connectedCallback() {
  this.render();
  this.#aborted = false;
  this.#runConnectedStage();
}
```

Add these three private methods (place them after `connectedCallback`, before `disconnectedCallback`):

```ts
#runConnectedStage(): void {
  const connectedEvent = this.#dispatchLifecycle("ad-unit:connected");
  if (this.loading === "lazy") {
    // Task 6 replaces this — for now, fall through to legacy observer path.
    this.#setupObservers();
    return;
  }
  if (connectedEvent.pending.length === 0) {
    this.#runFetchStage();
    return;
  }
  this.#awaitStage(connectedEvent, () => this.#runFetchStage());
}

#runFetchStage(): void {
  if (this.#aborted) return;
  const fetchEvent = this.#dispatchLifecycle("ad-unit:fetch");
  if (fetchEvent.pending.length === 0) {
    this.#runRenderStage();
    return;
  }
  this.#awaitStage(fetchEvent, () => this.#runRenderStage());
}

#runRenderStage(): void {
  if (this.#aborted) return;
  const renderEvent = this.#dispatchLifecycle("ad-unit:render");
  if (renderEvent.pending.length === 0) return;
  this.#awaitStage(renderEvent, () => {
    /* terminal stage — nothing to advance */
  });
}

#awaitStage(event: AdUnitLifecycleEvent, onResolved: () => void): void {
  Promise.all(event.pending).then(
    () => {
      if (this.#aborted) return;
      onResolved();
    },
    (_error) => {
      // Error handling added in Task 4.
    },
  );
}
```

Update `disconnectedCallback` to set `#aborted`:

```ts
disconnectedCallback() {
  this.#aborted = true;
  this.#teardownObservers();
  this.#dispatchLifecycle("ad-unit:disconnected");
}
```

**Do NOT delete** the existing `#setupObservers`, `#createObserver`, `#teardownObservers`, or the observer fields yet — Task 6 removes them. The `connectedCallback` branching above routes lazy mode through them unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts`
Expected: all tests pass, including the new `waitUntil (eager mode)` block and all existing eager/lazy/margin tests.

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "Add sync-until-blocked lifecycle chain for eager mode"
```

---

## Task 4: Error handling — dispatch `ad-unit:error` on rejection

**Files:**
- Modify: `src/ad-unit.ts` (`#awaitStage`)
- Test: `src/ad-unit.test.ts` (new tests in `waitUntil (eager mode)` block)

- [ ] **Step 1: Write failing tests**

Add these tests inside the `describe("waitUntil (eager mode)", ...)` block added in Task 3:

```ts
test("rejection halts lifecycle and fires ad-unit:error", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  const error = new Error("bid server down");

  let renderFired = false;
  let errorDetail: { stage: string; error: unknown } | null = null;
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(error));
  });
  element.addEventListener("ad-unit:render", () => {
    renderFired = true;
  });
  element.addEventListener("ad-unit:error", (e) => {
    errorDetail = (e as CustomEvent).detail;
  });

  container.appendChild(element);

  // Flush microtasks for the rejection to propagate.
  await Promise.resolve();
  await Promise.resolve();

  expect(renderFired).toBe(false);
  expect(errorDetail).not.toBeNull();
  expect(errorDetail!.stage).toBe("fetch");
  expect(errorDetail!.error).toBe(error);
});

test("AbortError on zone promise does not dispatch ad-unit:error", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  const abortError = new DOMException("ad-unit disconnected", "AbortError");

  let errorCount = 0;
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(abortError));
  });
  element.addEventListener("ad-unit:error", () => {
    errorCount++;
  });

  container.appendChild(element);

  await Promise.resolve();
  await Promise.resolve();

  expect(errorCount).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/ad-unit.test.ts`
Expected: `rejection halts lifecycle` fails because no `ad-unit:error` is dispatched.

- [ ] **Step 3: Implement error dispatch**

In `src/ad-unit.ts`, add a small helper near the top of `AdUnit` (alongside other private helpers — it's used by multiple tasks):

```ts
#stageName(eventType: string): string {
  return eventType.replace(/^ad-unit:/, "");
}
```

Replace the `#awaitStage` stub from Task 3 with:

```ts
#awaitStage(event: AdUnitLifecycleEvent, onResolved: () => void): void {
  Promise.all(event.pending).then(
    () => {
      if (this.#aborted) return;
      onResolved();
    },
    (error: unknown) => {
      if (this.#aborted) return;
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }
      this.dispatchEvent(
        new CustomEvent("ad-unit:error", {
          bubbles: true,
          composed: true,
          cancelable: false,
          detail: { stage: this.#stageName(event.type), error },
        }),
      );
    },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "Dispatch ad-unit:error when waitUntil rejects"
```

---

## Task 5: Add `blocked` property and `stage-blocked` / `stage-unblocked` events

**Files:**
- Modify: `src/ad-unit.ts` (`#awaitStage`, add `blocked` getter, add stage field)
- Test: `src/ad-unit.test.ts` (new tests in `waitUntil (eager mode)` block)

- [ ] **Step 1: Write failing tests**

Add these tests inside the `describe("waitUntil (eager mode)", ...)` block:

```ts
test("adUnit.blocked is false before connect", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  expect(element.blocked).toBe(false);
});

test("adUnit.blocked is false after sync lifecycle completes", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);
  expect(element.blocked).toBe(false);
});

test("adUnit.blocked reflects pending waitUntil", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  let resolve: () => void;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(gate);
  });

  container.appendChild(element);
  expect(element.blocked).toBe(true);

  resolve!();
  await gate;
  await Promise.resolve();

  expect(element.blocked).toBe(false);
});

test("adUnit.blocked is false after rejection", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(new Error("x")));
  });
  container.appendChild(element);

  await Promise.resolve();
  await Promise.resolve();

  expect(element.blocked).toBe(false);
});

test("stage-blocked and stage-unblocked fire around pending stage", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  let resolve: () => void;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  const events: { type: string; stage: string }[] = [];
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(gate);
  });
  element.addEventListener("ad-unit:stage-blocked", (e) => {
    events.push({ type: "blocked", stage: (e as CustomEvent).detail.stage });
  });
  element.addEventListener("ad-unit:stage-unblocked", (e) => {
    events.push({ type: "unblocked", stage: (e as CustomEvent).detail.stage });
  });

  container.appendChild(element);
  expect(events).toEqual([{ type: "blocked", stage: "fetch" }]);

  resolve!();
  await gate;
  await Promise.resolve();

  expect(events).toEqual([
    { type: "blocked", stage: "fetch" },
    { type: "unblocked", stage: "fetch" },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/ad-unit.test.ts`
Expected: `element.blocked is not a function/property`, and stage-blocked/unblocked events never fire.

- [ ] **Step 3: Implement `blocked` property and stage events**

In `src/ad-unit.ts`, add a private field:

```ts
#blockedStages = new Set<string>();
```

Add a public getter (place after the `renderMargin` setter, before `// --- Lifecycle ---`):

```ts
/**
 * True while any lifecycle stage is awaiting a waitUntil promise.
 */
get blocked(): boolean {
  return this.#blockedStages.size > 0;
}
```

Replace `#awaitStage` (the `#stageName` helper was added in Task 4) with:

```ts
#awaitStage(event: AdUnitLifecycleEvent, onResolved: () => void): void {
  const stage = this.#stageName(event.type);
  this.#blockedStages.add(event.type);
  this.dispatchEvent(
    new CustomEvent("ad-unit:stage-blocked", {
      bubbles: true,
      composed: true,
      cancelable: false,
      detail: { stage },
    }),
  );

  const finalize = () => {
    this.#blockedStages.delete(event.type);
    this.dispatchEvent(
      new CustomEvent("ad-unit:stage-unblocked", {
        bubbles: true,
        composed: true,
        cancelable: false,
        detail: { stage },
      }),
    );
  };

  Promise.all(event.pending).then(
    () => {
      finalize();
      if (this.#aborted) return;
      onResolved();
    },
    (error: unknown) => {
      finalize();
      if (this.#aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.dispatchEvent(
        new CustomEvent("ad-unit:error", {
          bubbles: true,
          composed: true,
          cancelable: false,
          detail: { stage: event.type, error },
        }),
      );
    },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "Add adUnit.blocked property and stage-blocked/unblocked events"
```

---

## Task 6: Add `#awaitZone` promise adapter with `AbortController`

**Files:**
- Modify: `src/ad-unit.ts` (add `#awaitZone`, `#zoneController`, initialize in `connectedCallback`)

This task adds the zone-to-promise helper *without yet wiring it into the lifecycle*. Task 7 swaps `#setupObservers` to use it. Direct tests for `#awaitZone` would require accessing a private method; coverage comes indirectly via the lazy-mode tests updated in Task 7.

- [ ] **Step 1: Add `#awaitZone` and `#zoneController` to `AdUnit`**

In `src/ad-unit.ts`, add two private fields alongside the existing ones:

```ts
#zoneController: AbortController | null = null;
```

Add the `#awaitZone` and `#resolveMargin` helpers (place them after `#setupObservers`, before `#createObserver`). `#resolveMargin` replaces the inline margin validation currently inside `#setupObservers`:

```ts
#resolveMargin(zone: "fetch" | "render"): string {
  const fetchMargin = this.fetchMargin;
  const renderMargin = this.renderMargin;
  const fetchParsed = parseMargin(fetchMargin, "fetch-margin", this.code);
  const renderParsed = parseMargin(renderMargin, "render-margin", this.code);

  let effectiveFetch = fetchMargin;
  if (
    fetchParsed.unit === renderParsed.unit &&
    fetchParsed.value < renderParsed.value
  ) {
    console.warn(
      `[ad-unit "${this.code}"] fetch-margin (${fetchMargin}) is less than render-margin (${renderMargin}), clamping fetch-margin to render-margin`,
    );
    effectiveFetch = renderMargin;
  }

  return zone === "fetch" ? effectiveFetch : renderMargin;
}

#awaitZone(zone: "fetch" | "render"): Promise<void> {
  const rawMargin = zone === "fetch" ? this.fetchMargin : this.renderMargin;
  const attributeName = zone === "fetch" ? "fetch-margin" : "render-margin";
  const effectiveMargin = this.#resolveMargin(zone);
  const signal = this.#zoneController?.signal;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("ad-unit disconnected", "AbortError"));
      return;
    }

    let observer: IntersectionObserver;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              observer.disconnect();
              resolve();
              return;
            }
          }
        },
        { rootMargin: effectiveMargin },
      );
    } catch (error) {
      reject(
        new Error(
          `[ad-unit "${this.code}"] Invalid ${attributeName} "${rawMargin}": ${
            error instanceof Error ? error.message : error
          }`,
        ),
      );
      return;
    }

    observer.observe(this);

    signal?.addEventListener(
      "abort",
      () => {
        observer.disconnect();
        reject(new DOMException("ad-unit disconnected", "AbortError"));
      },
      { once: true },
    );
  });
}
```

In `connectedCallback`, initialize the controller (just before `this.#runConnectedStage()`):

```ts
connectedCallback() {
  this.render();
  this.#aborted = false;
  this.#zoneController = new AbortController();
  this.#runConnectedStage();
}
```

In `disconnectedCallback`, abort it:

```ts
disconnectedCallback() {
  this.#aborted = true;
  this.#zoneController?.abort();
  this.#zoneController = null;
  this.#teardownObservers();
  this.#dispatchLifecycle("ad-unit:disconnected");
}
```

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `bun test src/ad-unit.test.ts`
Expected: all tests pass. `#awaitZone` is defined but not yet called by any lifecycle path.

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.ts
git commit -m "Add #awaitZone helper and AbortController wiring"
```

---

## Task 7: Refactor lazy loading to use `waitUntil` + `#awaitZone`

**Files:**
- Modify: `src/ad-unit.ts` (route lazy mode through `#runConnectedStage`)
- Test: `src/ad-unit.test.ts` (update three lazy-mode tests, add lazy+user-waitUntil test)

- [ ] **Step 1: Update existing lazy-mode tests**

Three existing tests assume **both** observers exist at connect time. After the refactor, only the fetch-zone observer is created at connect; the render-zone observer is created when fetch zone is entered. Rewrite them.

At `src/ad-unit.test.ts:695` (`"creates two IntersectionObservers on connect"`):

```ts
test("creates fetch-zone observer on connect, render-zone observer after fetch triggers", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  container.appendChild(element);

  expect(MockIntersectionObserver.instances).toHaveLength(1);
  expect(MockIntersectionObserver.instances[0].options.rootMargin).toBe("200%");

  MockIntersectionObserver.instances[0].trigger(element, true);
  // Wait a microtask for promise resolution to propagate.
  return Promise.resolve().then(() => {
    expect(MockIntersectionObserver.instances).toHaveLength(2);
    expect(MockIntersectionObserver.instances[1].options.rootMargin).toBe("150%");
  });
});
```

At `src/ad-unit.test.ts:751` (`"uses default margins (200% fetch, 150% render)"`):

```ts
test("uses default margins (200% fetch, 150% render)", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  container.appendChild(element);

  const fetchObserver = MockIntersectionObserver.instances[0];
  expect(fetchObserver.options.rootMargin).toBe("200%");

  fetchObserver.trigger(element, true);
  await Promise.resolve();

  const renderObserver = MockIntersectionObserver.instances[1];
  expect(renderObserver.options.rootMargin).toBe("150%");
});
```

At `src/ad-unit.test.ts:761` (`"uses custom margins from attributes"`):

```ts
test("uses custom margins from attributes", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  element.setAttribute("fetch-margin", "500px");
  element.setAttribute("render-margin", "100px");
  container.appendChild(element);

  const fetchObserver = MockIntersectionObserver.instances[0];
  expect(fetchObserver.options.rootMargin).toBe("500px");

  fetchObserver.trigger(element, true);
  await Promise.resolve();

  const renderObserver = MockIntersectionObserver.instances[1];
  expect(renderObserver.options.rootMargin).toBe("100px");
});
```

At `src/ad-unit.test.ts:715` (`"fires ad-unit:fetch when fetch observer triggers"`), make it async-aware:

```ts
test("fires ad-unit:fetch when fetch observer triggers", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  element.setAttribute("code", "test-ad");

  let received: CustomEvent | null = null;
  element.addEventListener("ad-unit:fetch", (e) => {
    received = e as CustomEvent;
  });

  container.appendChild(element);
  const fetchObserver = MockIntersectionObserver.instances[0];
  fetchObserver.trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();

  expect(received).not.toBeNull();
  expect((received as unknown as CustomEvent).detail.code).toBe("test-ad");
});
```

At `src/ad-unit.test.ts:733` (`"fires ad-unit:render when render observer triggers"`):

```ts
test("fires ad-unit:render when render observer triggers", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  element.setAttribute("code", "test-ad");

  let received: CustomEvent | null = null;
  element.addEventListener("ad-unit:render", (e) => {
    received = e as CustomEvent;
  });

  container.appendChild(element);
  // Enter fetch zone first
  MockIntersectionObserver.instances[0].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  // Now enter render zone
  MockIntersectionObserver.instances[1].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();

  expect(received).not.toBeNull();
  expect((received as unknown as CustomEvent).detail.code).toBe("test-ad");
});
```

At `src/ad-unit.test.ts:773` (`"each event fires at most once"`):

```ts
test("each event fires at most once", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  let fetchCount = 0;
  let renderCount = 0;
  element.addEventListener("ad-unit:fetch", () => fetchCount++);
  element.addEventListener("ad-unit:render", () => renderCount++);

  container.appendChild(element);
  const fetchObserver = MockIntersectionObserver.instances[0];

  fetchObserver.trigger(element, true);
  fetchObserver.trigger(element, true); // second trigger should no-op (observer disconnected)
  await Promise.resolve();
  await Promise.resolve();

  const renderObserver = MockIntersectionObserver.instances[1];
  renderObserver.trigger(element, true);
  renderObserver.trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();

  expect(fetchCount).toBe(1);
  expect(renderCount).toBe(1);
});
```

At `src/ad-unit.test.ts:793` (`"unobserves after event fires"`):

```ts
test("observer is disconnected after zone entered", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  container.appendChild(element);

  const fetchObserver = MockIntersectionObserver.instances[0];
  expect(fetchObserver.observed.has(element)).toBe(true);

  fetchObserver.trigger(element, true);
  expect(fetchObserver.disconnected).toBe(true);

  await Promise.resolve();
  await Promise.resolve();

  const renderObserver = MockIntersectionObserver.instances[1];
  expect(renderObserver.observed.has(element)).toBe(true);
  renderObserver.trigger(element, true);
  expect(renderObserver.disconnected).toBe(true);
});
```

At `src/ad-unit.test.ts:808` (`"observers disconnected on element removal"`):

```ts
test("zone observers disconnected on element removal", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  container.appendChild(element);

  const fetchObserver = MockIntersectionObserver.instances[0];
  container.removeChild(element);

  expect(fetchObserver.disconnected).toBe(true);
});
```

At `src/ad-unit.test.ts:820` (`"reconnect resets lifecycle — events fire again"`):

```ts
test("reconnect resets lifecycle — events fire again", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  let fetchCount = 0;
  let renderCount = 0;
  element.addEventListener("ad-unit:fetch", () => fetchCount++);
  element.addEventListener("ad-unit:render", () => renderCount++);

  container.appendChild(element);
  MockIntersectionObserver.instances[0].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  MockIntersectionObserver.instances[1].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  expect(fetchCount).toBe(1);
  expect(renderCount).toBe(1);

  container.removeChild(element);
  container.appendChild(element);

  const newFetchObserver = MockIntersectionObserver.instances[2];
  newFetchObserver.trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  const newRenderObserver = MockIntersectionObserver.instances[3];
  newRenderObserver.trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();

  expect(fetchCount).toBe(2);
  expect(renderCount).toBe(2);
});
```

At `src/ad-unit.test.ts:846` (`"element already in view: fetch fires before render"`):

```ts
test("element already in view: fetch fires before render", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  const order: string[] = [];
  element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
  element.addEventListener("ad-unit:render", () => order.push("render"));

  container.appendChild(element);
  MockIntersectionObserver.instances[0].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  MockIntersectionObserver.instances[1].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();

  expect(order).toEqual(["fetch", "render"]);
});
```

At `src/ad-unit.test.ts:860` (`"non-intersecting entries are ignored"`):

```ts
test("non-intersecting entries are ignored", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  let fetchCount = 0;
  element.addEventListener("ad-unit:fetch", () => fetchCount++);

  container.appendChild(element);
  MockIntersectionObserver.instances[0].trigger(element, false);
  await Promise.resolve();
  await Promise.resolve();

  expect(fetchCount).toBe(0);
});
```

Add a new test in the `"lazy mode"` describe block:

```ts
test("lazy loading composes with user waitUntil on fetch", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");

  let resolveAuction: () => void;
  const auction = new Promise<void>((r) => {
    resolveAuction = r;
  });

  let renderFired = false;
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(auction);
  });
  element.addEventListener("ad-unit:render", () => {
    renderFired = true;
  });

  container.appendChild(element);
  // Enter fetch zone
  MockIntersectionObserver.instances[0].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  // Enter render zone — but auction still pending
  MockIntersectionObserver.instances[1].trigger(element, true);
  await Promise.resolve();
  await Promise.resolve();
  expect(renderFired).toBe(false);

  resolveAuction!();
  await auction;
  await Promise.resolve();
  await Promise.resolve();

  expect(renderFired).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify rewrites fail against old implementation**

Run: `bun test src/ad-unit.test.ts`
Expected: many lazy-mode tests fail because old `#setupObservers` creates both observers upfront. This is the failing state that drives the implementation change.

- [ ] **Step 3: Route lazy mode through the waitUntil chain**

In `src/ad-unit.ts`, update `#runConnectedStage` — remove the `#setupObservers` branch and replace with a built-in `waitUntil` on the connected event when in lazy mode:

```ts
#runConnectedStage(): void {
  const connectedEvent = this.#dispatchLifecycle("ad-unit:connected");
  if (this.loading === "lazy") {
    connectedEvent.waitUntil(this.#awaitZone("fetch"));
  }
  if (connectedEvent.pending.length === 0) {
    this.#runFetchStage();
    return;
  }
  this.#awaitStage(connectedEvent, () => this.#runFetchStage());
}
```

The `#runFetchStage` needs the render-zone waiter added when lazy:

```ts
#runFetchStage(): void {
  if (this.#aborted) return;
  const fetchEvent = this.#dispatchLifecycle("ad-unit:fetch");
  if (this.loading === "lazy") {
    fetchEvent.waitUntil(this.#awaitZone("render"));
  }
  if (fetchEvent.pending.length === 0) {
    this.#runRenderStage();
    return;
  }
  this.#awaitStage(fetchEvent, () => this.#runRenderStage());
}
```

**Important:** `beginDispatch` / `endDispatch` currently wrap only `dispatchEvent` — so `waitUntil` called after `dispatchEvent` returns would throw. Fix by extending the dispatch window in `#dispatchLifecycle`:

```ts
#dispatchLifecycle(type: string): AdUnitLifecycleEvent {
  const event = new AdUnitLifecycleEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: false,
    detail: {
      code: this.code,
      sizes: this.sizes,
      gpid: this.gpid,
      pos: this.pos,
      format: this.format,
      container: this.container,
    },
  });
  event.beginDispatch();
  this.dispatchEvent(event);
  // Note: do NOT endDispatch yet. The caller may add built-in waiters
  // (e.g. lazy-loading zone promises) before inspecting .pending.
  return event;
}
```

Then add an explicit `endDispatch()` call in each stage runner, *after* any built-in waiters have been added:

```ts
#runConnectedStage(): void {
  const connectedEvent = this.#dispatchLifecycle("ad-unit:connected");
  if (this.loading === "lazy") {
    connectedEvent.waitUntil(this.#awaitZone("fetch"));
  }
  connectedEvent.endDispatch();
  if (connectedEvent.pending.length === 0) {
    this.#runFetchStage();
    return;
  }
  this.#awaitStage(connectedEvent, () => this.#runFetchStage());
}

#runFetchStage(): void {
  if (this.#aborted) return;
  const fetchEvent = this.#dispatchLifecycle("ad-unit:fetch");
  if (this.loading === "lazy") {
    fetchEvent.waitUntil(this.#awaitZone("render"));
  }
  fetchEvent.endDispatch();
  if (fetchEvent.pending.length === 0) {
    this.#runRenderStage();
    return;
  }
  this.#awaitStage(fetchEvent, () => this.#runRenderStage());
}

#runRenderStage(): void {
  if (this.#aborted) return;
  const renderEvent = this.#dispatchLifecycle("ad-unit:render");
  renderEvent.endDispatch();
  if (renderEvent.pending.length === 0) return;
  this.#awaitStage(renderEvent, () => {});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts`
Expected: all tests pass — including updated lazy-mode tests and the new lazy + user `waitUntil` composition test.

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "Refactor lazy loading to use waitUntil + #awaitZone"
```

---

## Task 8: Remove legacy observer fields and helpers

**Files:**
- Modify: `src/ad-unit.ts` (delete `#fetchObserver`, `#renderObserver`, `#fetchFired`, `#renderFired`, `#setupObservers`, `#createObserver`, `#teardownObservers`)

- [ ] **Step 1: Confirm nothing references them**

Run: `bun run lint` (Biome will flag unused private fields).
Run: `grep -n '#fetchObserver\|#renderObserver\|#fetchFired\|#renderFired\|#setupObservers\|#createObserver\|#teardownObservers' src/ad-unit.ts`

Expected: references are only in the declaration/definition lines — no callers.

- [ ] **Step 2: Delete the fields and methods**

In `src/ad-unit.ts`, remove:

1. Fields:
   ```ts
   #fetchObserver: IntersectionObserver | null = null;
   #renderObserver: IntersectionObserver | null = null;
   #fetchFired = false;
   #renderFired = false;
   ```

2. The entire `#setupObservers()`, `#createObserver()`, and `#teardownObservers()` method bodies.

3. The call to `this.#teardownObservers()` in `disconnectedCallback` (it's already a no-op but remove for cleanliness):

```ts
disconnectedCallback() {
  this.#aborted = true;
  this.#zoneController?.abort();
  this.#zoneController = null;
  this.#dispatchLifecycle("ad-unit:disconnected");
}
```

- [ ] **Step 3: Run tests and lint**

Run: `bun test src/ad-unit.test.ts`
Run: `bun run lint`
Expected: tests pass, lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/ad-unit.ts
git commit -m "Remove legacy observer fields and helpers"
```

---

## Task 9: Invalid margin now surfaces via `ad-unit:error`

**Files:**
- Modify: `src/ad-unit.test.ts` (update invalid-margin test to expect `ad-unit:error`)

The previous behavior was a synchronous throw from `connectedCallback`. With the refactor, the `IntersectionObserver` constructor error happens inside a promise, so the rejection flows through `#awaitStage` and dispatches `ad-unit:error`.

- [ ] **Step 1: Check current invalid-margin tests**

Run: `grep -n 'Invalid fetch-margin\|invalid fetch-margin\|banana' src/ad-unit.test.ts`

Expected: one or two tests that currently assert a synchronous throw.

- [ ] **Step 2: Rewrite to assert ad-unit:error dispatch**

Find the existing test(s) in `describe("margin validation", ...)` at or near `src/ad-unit.test.ts:873`. Replace any test matching the pattern "throws on invalid margin" with:

```ts
test("invalid fetch-margin surfaces via ad-unit:error", async () => {
  // Make the real IntersectionObserver reject on this margin
  globalThis.IntersectionObserver = class {
    constructor(_cb: IntersectionObserverCallback, options: IntersectionObserverInit) {
      throw new Error(`Failed to construct 'IntersectionObserver': '${options.rootMargin}' is not a valid value`);
    }
  } as unknown as typeof IntersectionObserver;

  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("code", "test-ad");
  element.setAttribute("loading", "lazy");
  element.setAttribute("fetch-margin", "banana");
  element.setAttribute("render-margin", "banana");

  let errorDetail: { stage: string; error: unknown } | null = null;
  element.addEventListener("ad-unit:error", (e) => {
    errorDetail = (e as CustomEvent).detail;
  });

  container.appendChild(element);

  await Promise.resolve();
  await Promise.resolve();

  expect(errorDetail).not.toBeNull();
  expect(errorDetail!.stage).toBe("connected");
  expect(errorDetail!.error).toBeInstanceOf(Error);
  expect((errorDetail!.error as Error).message).toContain(
    `[ad-unit "test-ad"] Invalid fetch-margin "banana":`,
  );
});
```

Note: this test overrides `globalThis.IntersectionObserver` mid-test because happy-dom's (and the mock's) constructor doesn't throw on bad margins. The parseMargin helper warns and falls back to defaults for unparseable margins, so we need the constructor itself to throw to exercise the error path.

**Alternative** if the real-IO override is too fragile: make `MockIntersectionObserver`'s constructor throw for certain sentinel margin values. If you go that route, add to the mock:

```ts
if (options.rootMargin === "__throw__") {
  throw new Error("Failed to construct 'IntersectionObserver': invalid margin");
}
```

…and use `"__throw__"` as the margin attribute value. Whichever approach fits cleaner in the codebase — both exercise the same error path.

- [ ] **Step 3: Run tests to verify**

Run: `bun test src/ad-unit.test.ts`
Expected: test passes, asserting error is routed through `ad-unit:error`.

- [ ] **Step 4: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "Surface invalid margin via ad-unit:error"
```

---

## Task 10: Export `AdUnitLifecycleEvent`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read current exports**

Run: `cat src/index.ts`

- [ ] **Step 2: Add export**

Add to `src/index.ts`:

```ts
export { AdUnit, AdUnitLifecycleEvent } from "./ad-unit";
export type { AdUnitLifecycleDetail } from "./ad-unit";
```

If `src/index.ts` already exports `AdUnit` separately, merge the exports into one line as above.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: build succeeds, generated `dist/index.d.ts` includes `AdUnitLifecycleEvent`.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "Export AdUnitLifecycleEvent"
```

---

## Task 11: Full verification

**Files:** none modified.

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: builds successfully, produces `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 4: Inspect `dist/index.d.ts`**

Run: `cat dist/index.d.ts`
Expected: `AdUnitLifecycleEvent` class and `AdUnitLifecycleDetail` interface are exported with correct signatures.

- [ ] **Step 5: Spot-check with demo harness**

Run: `bun run dev`
Open the demo page, verify ad units still fire lifecycle events (eager and lazy). No console errors. Close the server.

- [ ] **Step 6: Commit any follow-up tweaks**

If nothing changed, skip. Otherwise:

```bash
git add -A
git commit -m "Verification fixes from task 11"
```

---

## Summary of behavioral changes

1. Lifecycle events are `AdUnitLifecycleEvent` (subclass of `CustomEvent`) with `waitUntil(promise)` and `pending` properties.
2. Events are no longer `cancelable` — `preventDefault()` has no effect. Use `waitUntil(promise)` instead.
3. New events: `ad-unit:stage-blocked`, `ad-unit:stage-unblocked`, `ad-unit:error`.
4. New property: `adUnit.blocked: boolean`.
5. Lazy loading now creates observers lazily (fetch observer at connect, render observer when fetch zone is entered). Previously both were created upfront.
6. Invalid margin values surface via `ad-unit:error` instead of synchronous throw from `connectedCallback`.
7. Disconnecting an element during a pending lifecycle stage cleanly halts advancement (internal `AbortController` + `#aborted` flag).
