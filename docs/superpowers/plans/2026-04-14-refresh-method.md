# refresh() Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `refresh()` method to `<ad-unit>` that kicks off a new lifecycle cycle (dispatches `ad-unit:refresh` → `ad-unit:fetch` → `ad-unit:render`), with a `refreshCount` property and `refreshCount` field on `AdUnitLifecycleDetail`.

**Architecture:** Refresh reuses the existing `waitUntil` stage machinery from issue #5. A new `#runRefreshStage` dispatches `ad-unit:refresh` and chains into the same `#runFetchStage` / `#runRenderStage` used by the initial-connect path. Stages are parameterized with `source: "initial" | "refresh"` so lazy-loading zone waiters attach only on initial cycles — refresh explicitly bypasses viewport gating. A `cycleId` is threaded through stage runners as a parameter so nested refreshes from inside listeners can preempt their outer cycle cleanly.

**Tech Stack:** TypeScript, custom elements (HTMLElement), `CustomEvent` / event-based lifecycle, `bun:test` + `@happy-dom/global-registrator` for tests. Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-04-14-refresh-method-design.md`

---

## File Structure

**Modified files:**
- `src/ad-unit.ts` — all production changes (interface field, stage-chain refactor, new method, new stage runner, correctness fix)
- `src/ad-unit.test.ts` — all test additions / updates

**Unchanged:**
- `src/index.ts` — `AdUnitLifecycleDetail` is already exported; the new optional `refreshCount` field rides along
- `src/types.ts`, `src/utils/parse-sizes.ts`, `build.ts` — untouched

---

## Task 1: Thread `cycleId` through stage runners and fix `finalize()` stale-check order

**Files:**
- Modify: `src/ad-unit.ts:306-396` (`#runConnectedStage`, `#runFetchStage`, `#runRenderStage`, `#awaitStage`)
- Test: `src/ad-unit.test.ts` (new regression test)

The current `#awaitStage` captures `this.#cycleId` at call time and does `#blockedStages.delete(event.type)` before the stale check. Under nested refresh or reconnect-with-new-waitUntil, this causes a stale cycle's finalize to erase the new cycle's `#blockedStages` entry. Fix by threading `cycleId` as a parameter and moving the stale check above the delete. No other visible behavior changes — existing tests must still pass.

- [ ] **Step 1: Add regression test for `#blockedStages` leak on reconnect with new waiter**

Add a test at the end of the existing `describe("waitUntil (eager mode)")` block in `src/ad-unit.test.ts` (after the existing "reconnect while promise is pending..." test at line 1396):

```ts
test("old cycle's finalize does not clear new cycle's blocked entry after reconnect", async () => {
  const element = document.createElement("ad-unit") as AdUnit;

  let resolveStale: () => void;
  const staleGate = new Promise<void>((r) => {
    resolveStale = r;
  });
  const staleHandler = (e: Event) => {
    (e as AdUnitLifecycleEvent).waitUntil(staleGate);
  };
  element.addEventListener("ad-unit:fetch", staleHandler);

  container.appendChild(element);
  expect(element.blocked).toBe(true);

  container.removeChild(element);
  element.removeEventListener("ad-unit:fetch", staleHandler);

  let resolveFresh: () => void;
  const freshGate = new Promise<void>((r) => {
    resolveFresh = r;
  });
  const freshHandler = (e: Event) => {
    (e as AdUnitLifecycleEvent).waitUntil(freshGate);
  };
  element.addEventListener("ad-unit:fetch", freshHandler);

  container.appendChild(element);
  expect(element.blocked).toBe(true);

  resolveStale!();
  await staleGate;
  await Promise.resolve();
  await Promise.resolve();

  // New cycle still pending — blocked must remain true.
  expect(element.blocked).toBe(true);

  resolveFresh!();
  await freshGate;
  await Promise.resolve();
  await Promise.resolve();

  expect(element.blocked).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/ad-unit.test.ts -t "old cycle's finalize does not clear"`

Expected: FAIL on `expect(element.blocked).toBe(true)` after the stale gate resolves — the stale finalize currently deletes the fresh cycle's entry.

- [ ] **Step 3: Refactor `#awaitStage` to accept `cycleId` as a parameter and move stale check before delete**

Replace the current `#awaitStage` in `src/ad-unit.ts` (currently lines 347–396):

```ts
#awaitStage(
  event: AdUnitLifecycleEvent,
  cycleId: number,
  onResolved: () => void,
): void {
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

  const isStale = () => this.#aborted || this.#cycleId !== cycleId;

  const finalize = () => {
    if (isStale()) return;
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
      if (isStale()) return;
      onResolved();
    },
    (error: unknown) => {
      finalize();
      if (isStale()) return;
      if (error instanceof DOMException && error.name === "AbortError")
        return;
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

- [ ] **Step 4: Update `#runConnectedStage` to capture `cycleId` and pass it**

Replace `#runConnectedStage` in `src/ad-unit.ts` (currently lines 306–317):

```ts
#runConnectedStage(): void {
  const cycleId = this.#cycleId;
  const connectedEvent = this.#dispatchLifecycle("ad-unit:connected");
  if (this.loading === "lazy") {
    connectedEvent.waitUntil(this.#awaitZone("fetch"));
  }
  connectedEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (connectedEvent.pending.length === 0) {
    this.#runFetchStage(cycleId);
    return;
  }
  this.#awaitStage(connectedEvent, cycleId, () => this.#runFetchStage(cycleId));
}
```

- [ ] **Step 5: Update `#runFetchStage` to accept and check `cycleId`**

Replace `#runFetchStage` in `src/ad-unit.ts` (currently lines 319–331):

```ts
#runFetchStage(cycleId: number): void {
  if (this.#aborted || this.#cycleId !== cycleId) return;
  const fetchEvent = this.#dispatchLifecycle("ad-unit:fetch");
  if (this.loading === "lazy") {
    fetchEvent.waitUntil(this.#awaitZone("render"));
  }
  fetchEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (fetchEvent.pending.length === 0) {
    this.#runRenderStage(cycleId);
    return;
  }
  this.#awaitStage(fetchEvent, cycleId, () => this.#runRenderStage(cycleId));
}
```

*(Note: `source` parameter for lazy-zone suppression is added in Task 2. Keeping the lazy-zone attachment here for now — Task 1 is a pure staleness refactor, Task 2 parameterizes behavior.)*

- [ ] **Step 6: Update `#runRenderStage` to accept and check `cycleId`**

Replace `#runRenderStage` in `src/ad-unit.ts` (currently lines 333–341):

```ts
#runRenderStage(cycleId: number): void {
  if (this.#aborted || this.#cycleId !== cycleId) return;
  const renderEvent = this.#dispatchLifecycle("ad-unit:render");
  renderEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (renderEvent.pending.length === 0) return;
  this.#awaitStage(renderEvent, cycleId, () => {
    /* terminal stage — no downstream; #awaitStage still tracks blocked state */
  });
}
```

- [ ] **Step 7: Run all tests to verify the regression is fixed and nothing else regressed**

Run: `bun test`

Expected: all tests pass, including the new "old cycle's finalize does not clear new cycle's blocked entry after reconnect".

- [ ] **Step 8: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "fix(ad-unit): guard finalize against stale-cycle blockedStages leak

Thread cycleId as a parameter through the stage chain (#runConnectedStage,
#runFetchStage, #runRenderStage, #awaitStage) and move the stale check in
finalize() before the blockedStages.delete. This prevents a completed
promise from an aborted cycle from erasing the new cycle's blockedStages
entry when both cycles block on the same event type — a latent bug on
the reconnect-with-new-waitUntil path that would also be hit by the
upcoming refresh() method."
```

---

## Task 2: Parameterize stages with `source: "initial" | "refresh"`

**Files:**
- Modify: `src/ad-unit.ts` (`#runConnectedStage`, `#runFetchStage`, `#runRenderStage`)

Add a `source` parameter that gates lazy-zone waiter attachment. Only `"initial"` cycles attach zone waiters; future refresh cycles will pass `"refresh"` to bypass them. Pure refactor — no behavior change for the initial-connect path. All existing tests pass.

- [ ] **Step 1: Update `#runConnectedStage` to pass `"initial"` into `#runFetchStage`**

Replace `#runConnectedStage` in `src/ad-unit.ts`:

```ts
#runConnectedStage(): void {
  const cycleId = this.#cycleId;
  const connectedEvent = this.#dispatchLifecycle("ad-unit:connected");
  if (this.loading === "lazy") {
    connectedEvent.waitUntil(this.#awaitZone("fetch"));
  }
  connectedEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (connectedEvent.pending.length === 0) {
    this.#runFetchStage("initial", cycleId);
    return;
  }
  this.#awaitStage(connectedEvent, cycleId, () =>
    this.#runFetchStage("initial", cycleId),
  );
}
```

- [ ] **Step 2: Update `#runFetchStage` with `source` parameter gating the zone waiter**

Replace `#runFetchStage` in `src/ad-unit.ts`:

```ts
#runFetchStage(source: "initial" | "refresh", cycleId: number): void {
  if (this.#aborted || this.#cycleId !== cycleId) return;
  const fetchEvent = this.#dispatchLifecycle("ad-unit:fetch");
  if (source === "initial" && this.loading === "lazy") {
    fetchEvent.waitUntil(this.#awaitZone("render"));
  }
  fetchEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (fetchEvent.pending.length === 0) {
    this.#runRenderStage(source, cycleId);
    return;
  }
  this.#awaitStage(fetchEvent, cycleId, () =>
    this.#runRenderStage(source, cycleId),
  );
}
```

- [ ] **Step 3: Update `#runRenderStage` with `source` parameter (unused but threaded for symmetry)**

Replace `#runRenderStage` in `src/ad-unit.ts`:

```ts
#runRenderStage(_source: "initial" | "refresh", cycleId: number): void {
  if (this.#aborted || this.#cycleId !== cycleId) return;
  const renderEvent = this.#dispatchLifecycle("ad-unit:render");
  renderEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (renderEvent.pending.length === 0) return;
  this.#awaitStage(renderEvent, cycleId, () => {
    /* terminal stage — no downstream; #awaitStage still tracks blocked state */
  });
}
```

The `_source` parameter is accepted for call-site symmetry but unused today (render has no zone waiter). Prefixed with underscore so Biome does not flag it.

- [ ] **Step 4: Run all tests to verify no regression**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ad-unit.ts
git commit -m "refactor(ad-unit): parameterize lifecycle stages with cycle source

Add a source: 'initial' | 'refresh' parameter to #runFetchStage and
#runRenderStage (threaded from #runConnectedStage). Zone waiters only
attach on 'initial' cycles. Pure refactor — no behavior change today;
prepares the stage chain for refresh cycles to bypass viewport gating."
```

---

## Task 3: Add `#refreshCount` field, public getter, and detail field

**Files:**
- Modify: `src/ad-unit.ts` (add field, getter, update `AdUnitLifecycleDetail`, update `#dispatchLifecycle`)
- Test: `src/ad-unit.test.ts` (new tests)

Add instance state for refresh count. No `refresh()` method yet — that comes in Task 4. This task validates that `refreshCount` is observable via the property and the detail field of every lifecycle event.

- [ ] **Step 1: Write failing tests for `refreshCount` property and detail field**

Add a new `describe("refreshCount")` block in `src/ad-unit.test.ts` (place it after the existing `describe("renderMargin property")` block, around line 611 based on current layout):

```ts
describe("refreshCount", () => {
  test("is 0 before any refresh call", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    expect(element.refreshCount).toBe(0);
  });

  test("is 0 on connected event detail for initial cycle", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    let detail: { refreshCount?: number } | undefined;
    element.addEventListener("ad-unit:connected", (e) => {
      detail = (e as CustomEvent).detail;
    });
    container.appendChild(element);
    expect(detail?.refreshCount).toBe(0);
  });

  test("is 0 on fetch and render event details for initial cycle", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    let fetchDetail: { refreshCount?: number } | undefined;
    let renderDetail: { refreshCount?: number } | undefined;
    element.addEventListener("ad-unit:fetch", (e) => {
      fetchDetail = (e as CustomEvent).detail;
    });
    element.addEventListener("ad-unit:render", (e) => {
      renderDetail = (e as CustomEvent).detail;
    });
    container.appendChild(element);
    expect(fetchDetail?.refreshCount).toBe(0);
    expect(renderDetail?.refreshCount).toBe(0);
  });

  test("is 0 on disconnected event detail for initial cycle", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    let detail: { refreshCount?: number } | undefined;
    element.addEventListener("ad-unit:disconnected", (e) => {
      detail = (e as CustomEvent).detail;
    });
    container.appendChild(element);
    container.removeChild(element);
    expect(detail?.refreshCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/ad-unit.test.ts -t "refreshCount"`

Expected: 4 failures — `element.refreshCount` is undefined, detail does not have `refreshCount`.

- [ ] **Step 3: Add `#refreshCount` field and `refreshCount` getter to `AdUnit`**

In `src/ad-unit.ts`, inside the `AdUnit` class, add the field near the other private fields (around line 122, after `#blockedStages`):

```ts
#refreshCount = 0;
```

And add a public getter near the other getters (e.g., right after the `blocked` getter, around line 293):

```ts
/**
 * Number of times refresh() has been called on this element instance.
 * 0 on initial connect; incremented immediately before each ad-unit:refresh
 * dispatch. Persists across disconnect/reconnect of the same instance.
 */
get refreshCount(): number {
  return this.#refreshCount;
}
```

- [ ] **Step 4: Add `refreshCount` to `AdUnitLifecycleDetail` and `#dispatchLifecycle`**

In `src/ad-unit.ts`, update the `AdUnitLifecycleDetail` interface (around line 29):

```ts
export interface AdUnitLifecycleDetail {
  code?: string;
  sizes?: number[][];
  gpid?: string | null;
  pos?: number | null;
  format?: BannerFormat[] | null;
  container?: HTMLDivElement;
  refreshCount?: number;
}
```

And update `#dispatchLifecycle` (currently around lines 485–504) to include `refreshCount`:

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
      refreshCount: this.#refreshCount,
    },
  });
  event.beginDispatch();
  this.dispatchEvent(event);
  // Note: do NOT endDispatch yet. The caller may add built-in waiters
  // (e.g. lazy-loading zone promises) before inspecting .pending.
  return event;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refreshCount"`

Expected: all 4 refreshCount tests pass.

- [ ] **Step 6: Run the full test suite to verify no regression**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "feat(ad-unit): add refreshCount property and detail field

Add #refreshCount instance state and a public readonly refreshCount
getter. Include refreshCount in AdUnitLifecycleDetail so every lifecycle
event (connected, fetch, render, disconnected) carries the current
count. Value is 0 until refresh() is called (method added in a follow-up
commit)."
```

---

## Task 4: Add `refresh()` method and `#runRefreshStage`

**Files:**
- Modify: `src/ad-unit.ts` (new method, new stage runner)
- Test: `src/ad-unit.test.ts` (new `describe("refresh()")` block)

This is the core of the feature. Adds the public `refresh()` method plus `#runRefreshStage`, which dispatches `ad-unit:refresh` and chains into `#runFetchStage("refresh", cycleId)`.

- [ ] **Step 1: Write failing tests for basic refresh dispatch and cycle chain**

Add a new `describe("refresh()")` block at the end of the main `describe("AdUnit")` (before its closing brace, after the existing `describe("AdUnitLifecycleEvent")` block around line 1425):

```ts
describe("refresh()", () => {
  test("dispatches ad-unit:refresh on the element", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    container.appendChild(element);

    let fired = false;
    element.addEventListener("ad-unit:refresh", () => {
      fired = true;
    });
    element.refresh();
    expect(fired).toBe(true);
  });

  test("refresh event is an AdUnitLifecycleEvent with correct flags", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    container.appendChild(element);

    let captured: Event | undefined;
    element.addEventListener("ad-unit:refresh", (e) => {
      captured = e;
    });
    element.refresh();

    expect(captured).toBeInstanceOf(AdUnitLifecycleEvent);
    expect(captured?.bubbles).toBe(true);
    expect(captured?.composed).toBe(true);
    expect(captured?.cancelable).toBe(false);
  });

  test("refresh event detail carries full configuration plus refreshCount", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    element.setAttribute("code", "test-ad");
    element.setAttribute("sizes", "300x250");
    element.setAttribute("gpid", "/123/home");
    element.setAttribute("pos", "1");
    container.appendChild(element);

    let detail:
      | {
          code?: string;
          sizes?: number[][];
          gpid?: string | null;
          pos?: number | null;
          container?: HTMLDivElement;
          refreshCount?: number;
        }
      | undefined;
    element.addEventListener("ad-unit:refresh", (e) => {
      detail = (e as CustomEvent).detail;
    });
    element.refresh();

    expect(detail?.code).toBe("test-ad");
    expect(detail?.sizes).toEqual([[300, 250]]);
    expect(detail?.gpid).toBe("/123/home");
    expect(detail?.pos).toBe(1);
    expect(detail?.container).toBe(element.container);
    expect(detail?.refreshCount).toBe(1);
  });

  test("refresh chains refresh → fetch → render in order", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    container.appendChild(element);

    const order: string[] = [];
    element.addEventListener("ad-unit:refresh", () => order.push("refresh"));
    element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
    element.addEventListener("ad-unit:render", () => order.push("render"));

    element.refresh();

    expect(order).toEqual(["refresh", "fetch", "render"]);
  });

  test("document-level listener receives ad-unit:refresh (bubbles + composed)", () => {
    const element = document.createElement("ad-unit") as AdUnit;
    container.appendChild(element);

    let fired = false;
    const handler = () => {
      fired = true;
    };
    document.addEventListener("ad-unit:refresh", handler);
    try {
      element.refresh();
    } finally {
      document.removeEventListener("ad-unit:refresh", handler);
    }
    expect(fired).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: 5 failures — `element.refresh is not a function`.

- [ ] **Step 3: Implement `#runRefreshStage` and `refresh()` in `src/ad-unit.ts`**

Add `#runRefreshStage` right after `#runConnectedStage` (just before `#runFetchStage`):

```ts
#runRefreshStage(): void {
  const cycleId = this.#cycleId;
  const refreshEvent = this.#dispatchLifecycle("ad-unit:refresh");
  refreshEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (refreshEvent.pending.length === 0) {
    this.#runFetchStage("refresh", cycleId);
    return;
  }
  this.#awaitStage(refreshEvent, cycleId, () =>
    this.#runFetchStage("refresh", cycleId),
  );
}
```

Add the public `refresh()` method. Place it near the `connectedCallback` block (logical grouping — both are lifecycle entry points). After `connectedCallback` / its helper `#runConnectedStage` seems natural. Add right before `disconnectedCallback`:

```ts
/**
 * Kicks off a new lifecycle cycle: dispatches ad-unit:refresh, then
 * chains into ad-unit:fetch → ad-unit:render using the same waitUntil
 * machinery as the initial connect. No-op (with console.warn) if the
 * element is not connected. Aborts any in-flight cycle (pending
 * waitUntil promises from the prior cycle settle into no-ops via the
 * cycle-id stale check).
 *
 * Refresh bypasses lazy-loading viewport gates — the caller is
 * explicitly asking for a refresh. Viewability-gated scheduling is
 * a refresh-adapter concern, not a component concern.
 */
refresh(): void {
  if (!this.isConnected) {
    console.warn(
      `[ad-unit "${this.code}"] refresh() called on disconnected element; ignored`,
    );
    return;
  }
  this.#zoneController?.abort();
  this.#cycleId++;
  this.#blockedStages.clear();
  this.#zoneController = new AbortController();
  this.#refreshCount++;
  this.#runRefreshStage();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full test suite to verify no regression**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ad-unit.ts src/ad-unit.test.ts
git commit -m "feat(ad-unit): add refresh() method and ad-unit:refresh event

refresh() kicks off a new lifecycle cycle on the element — dispatches
ad-unit:refresh, then chains into ad-unit:fetch → ad-unit:render via
the existing waitUntil stage machinery. No-op with console.warn if the
element is not connected. Aborts any in-flight cycle; refreshCount
increments before dispatch so the event detail carries the new value.

Resolves the method surface required by issue #6."
```

---

## Task 5: Tests for `refreshCount` increment and persistence

**Files:**
- Test: `src/ad-unit.test.ts` (add tests to the existing `describe("refreshCount")` block)

Validate that `refreshCount` increments correctly across multiple calls, that all events in a refresh cycle carry the incremented value, and that the count persists across disconnect/reconnect of the same instance.

- [ ] **Step 1: Write failing tests for refreshCount increment behavior**

Append to the existing `describe("refreshCount")` block in `src/ad-unit.test.ts` (inside, after the last test):

```ts
test("increments to 1 after first refresh, 2 after second", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  expect(element.refreshCount).toBe(0);
  element.refresh();
  expect(element.refreshCount).toBe(1);
  element.refresh();
  expect(element.refreshCount).toBe(2);
});

test("refresh, fetch, and render events in a refresh cycle all carry the new count", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  const seen: number[] = [];
  const capture = (e: Event) => {
    seen.push((e as CustomEvent).detail.refreshCount);
  };
  element.addEventListener("ad-unit:refresh", capture);
  element.addEventListener("ad-unit:fetch", capture);
  element.addEventListener("ad-unit:render", capture);

  element.refresh();

  expect(seen).toEqual([1, 1, 1]);
});

test("persists across disconnect and reconnect of the same instance", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  element.refresh();
  element.refresh();
  expect(element.refreshCount).toBe(2);

  container.removeChild(element);
  container.appendChild(element);

  expect(element.refreshCount).toBe(2);
});

test("is 2 on connected event detail after reconnect that followed two refreshes", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);
  element.refresh();
  element.refresh();

  let detail: { refreshCount?: number } | undefined;
  element.addEventListener("ad-unit:connected", (e) => {
    detail = (e as CustomEvent).detail;
  });

  container.removeChild(element);
  container.appendChild(element);

  expect(detail?.refreshCount).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refreshCount"`

Expected: all refreshCount tests pass (original 4 + new 4 = 8).

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "test(ad-unit): cover refreshCount increment and persistence"
```

---

## Task 6: Tests for `waitUntil` and error semantics on `ad-unit:refresh`

**Files:**
- Test: `src/ad-unit.test.ts` (add tests to `describe("refresh()")`)

Validate that `event.waitUntil(promise)` on `ad-unit:refresh` defers the next stage, that rejection halts the cycle, and that blocked/unblocked state events fire correctly around the refresh stage.

- [ ] **Step 1: Write failing tests for waitUntil and error behavior**

Append to the existing `describe("refresh()")` block in `src/ad-unit.test.ts`:

```ts
test("waitUntil on ad-unit:refresh defers fetch until the promise resolves", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  let resolveGate: () => void;
  const gate = new Promise<void>((r) => {
    resolveGate = r;
  });

  let fetchFired = false;
  element.addEventListener("ad-unit:refresh", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(gate);
  });
  element.addEventListener("ad-unit:fetch", () => {
    fetchFired = true;
  });

  element.refresh();
  expect(fetchFired).toBe(false);
  expect(element.blocked).toBe(true);

  resolveGate!();
  await gate;
  await Promise.resolve();
  await Promise.resolve();

  expect(fetchFired).toBe(true);
  expect(element.blocked).toBe(false);
});

test("rejected waitUntil on ad-unit:refresh fires ad-unit:error with stage 'refresh'", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  element.addEventListener("ad-unit:refresh", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(new Error("policy")));
  });

  let fetchFired = false;
  element.addEventListener("ad-unit:fetch", () => {
    fetchFired = true;
  });

  let errorDetail: { stage?: string; error?: unknown } | undefined;
  element.addEventListener("ad-unit:error", (e) => {
    errorDetail = (e as CustomEvent).detail;
  });

  element.refresh();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(fetchFired).toBe(false);
  expect(errorDetail?.stage).toBe("refresh");
  expect((errorDetail?.error as Error).message).toBe("policy");
});

test("stage-blocked and stage-unblocked fire around pending refresh stage", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  const events: { type: string; stage: string }[] = [];
  element.addEventListener("ad-unit:stage-blocked", (e) => {
    events.push({ type: "blocked", stage: (e as CustomEvent).detail.stage });
  });
  element.addEventListener("ad-unit:stage-unblocked", (e) => {
    events.push({ type: "unblocked", stage: (e as CustomEvent).detail.stage });
  });

  let resolveGate: () => void;
  const gate = new Promise<void>((r) => {
    resolveGate = r;
  });
  element.addEventListener("ad-unit:refresh", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(gate);
  });

  element.refresh();
  expect(events).toEqual([{ type: "blocked", stage: "refresh" }]);

  resolveGate!();
  await gate;
  await Promise.resolve();
  await Promise.resolve();

  expect(events).toEqual([
    { type: "blocked", stage: "refresh" },
    { type: "unblocked", stage: "refresh" },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: all refresh() tests pass (original 5 + new 3 = 8).

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "test(ad-unit): cover waitUntil, error, and stage-blocked/unblocked on ad-unit:refresh"
```

---

## Task 7: Tests for `refresh()` on disconnected element

**Files:**
- Test: `src/ad-unit.test.ts` (add tests to `describe("refresh()")`)

Validate the defensive check: `refresh()` on a never-connected element or an already-disconnected element warns and is a no-op.

- [ ] **Step 1: Write failing tests for disconnected-element behavior**

Append to `describe("refresh()")`:

```ts
test("refresh on never-connected element warns and no-ops", () => {
  const element = document.createElement("ad-unit") as AdUnit;

  let fired = false;
  element.addEventListener("ad-unit:refresh", () => {
    fired = true;
  });

  const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  try {
    element.refresh();
  } finally {
    warnSpy.mockRestore();
  }

  expect(fired).toBe(false);
  expect(element.refreshCount).toBe(0);
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("refresh on element after disconnect warns and no-ops", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);
  container.removeChild(element);

  let fired = false;
  element.addEventListener("ad-unit:refresh", () => {
    fired = true;
  });

  const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  try {
    element.refresh();
  } finally {
    warnSpy.mockRestore();
  }

  expect(fired).toBe(false);
  expect(warnSpy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: the 2 new disconnected tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "test(ad-unit): cover refresh() no-op on disconnected element"
```

---

## Task 8: Tests for refresh mid-flight (abort-and-restart)

**Files:**
- Test: `src/ad-unit.test.ts` (add tests to `describe("refresh()")`)

Validate that a `refresh()` call during a pending `waitUntil` aborts the old cycle cleanly (no further events from the stale cycle) and starts a new cycle.

- [ ] **Step 1: Write failing tests for mid-flight interruption**

Append to `describe("refresh()")`:

```ts
test("refresh while initial ad-unit:fetch is blocked aborts old cycle and starts a new one", async () => {
  const element = document.createElement("ad-unit") as AdUnit;

  let resolveStale: () => void;
  const staleGate = new Promise<void>((r) => {
    resolveStale = r;
  });
  const staleFetchHandler = (e: Event) => {
    (e as AdUnitLifecycleEvent).waitUntil(staleGate);
  };
  element.addEventListener("ad-unit:fetch", staleFetchHandler);

  let renderCount = 0;
  element.addEventListener("ad-unit:render", () => {
    renderCount++;
  });

  container.appendChild(element);
  expect(element.blocked).toBe(true);

  element.removeEventListener("ad-unit:fetch", staleFetchHandler);
  element.refresh();

  // New cycle completes synchronously (no listeners blocking fetch)
  expect(renderCount).toBe(1);
  expect(element.blocked).toBe(false);

  // Old promise resolves — must not retrigger anything
  resolveStale!();
  await staleGate;
  await Promise.resolve();
  await Promise.resolve();

  expect(renderCount).toBe(1);
  expect(element.blocked).toBe(false);
});

test("two refreshes in rapid succession: only the newest cycle's fetch/render complete", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  let resolveFirst: () => void;
  const firstGate = new Promise<void>((r) => {
    resolveFirst = r;
  });

  let refreshCalls = 0;
  const refreshHandler = (e: Event) => {
    refreshCalls++;
    if (refreshCalls === 1) {
      (e as AdUnitLifecycleEvent).waitUntil(firstGate);
    }
  };
  element.addEventListener("ad-unit:refresh", refreshHandler);

  let renderCount = 0;
  element.addEventListener("ad-unit:render", () => {
    renderCount++;
  });

  element.refresh(); // first refresh: blocks on firstGate
  expect(element.blocked).toBe(true);
  expect(renderCount).toBe(0);

  element.refresh(); // second refresh: aborts first, runs synchronously
  expect(renderCount).toBe(1);
  expect(element.blocked).toBe(false);

  // First gate resolves post-hoc — stale, must not advance
  resolveFirst!();
  await firstGate;
  await Promise.resolve();
  await Promise.resolve();

  expect(renderCount).toBe(1);
});

test("adUnit.blocked tracks only the newest cycle", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  let resolveFirst: () => void;
  const firstGate = new Promise<void>((r) => {
    resolveFirst = r;
  });
  let resolveSecond: () => void;
  const secondGate = new Promise<void>((r) => {
    resolveSecond = r;
  });

  let call = 0;
  const handler = (e: Event) => {
    call++;
    const gate = call === 1 ? firstGate : secondGate;
    (e as AdUnitLifecycleEvent).waitUntil(gate);
  };
  element.addEventListener("ad-unit:refresh", handler);

  element.refresh();
  expect(element.blocked).toBe(true);

  element.refresh();
  expect(element.blocked).toBe(true); // still blocked — new cycle's gate pending

  resolveFirst!();
  await firstGate;
  await Promise.resolve();
  await Promise.resolve();

  expect(element.blocked).toBe(true); // still blocked — second gate not resolved yet

  resolveSecond!();
  await secondGate;
  await Promise.resolve();
  await Promise.resolve();

  expect(element.blocked).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: all refresh() tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "test(ad-unit): cover abort-and-restart semantics when refresh is called mid-flight"
```

---

## Task 9: Tests for lazy-loading bypass on refresh

**Files:**
- Test: `src/ad-unit.test.ts` (add tests to `describe("refresh()")`)

Validate that `refresh()` on a `loading="lazy"` element fires fetch and render without waiting for viewport zones — and does not create new IntersectionObserver instances.

- [ ] **Step 1: Write failing tests for lazy-loading bypass**

Append to `describe("refresh()")`:

```ts
test("refresh on lazy-loaded element fires fetch and render without waiting for viewport", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  container.appendChild(element);

  // Initial connect: fetch and render blocked on zone observers — element is offscreen
  let fetchCount = 0;
  let renderCount = 0;
  element.addEventListener("ad-unit:fetch", () => {
    fetchCount++;
  });
  element.addEventListener("ad-unit:render", () => {
    renderCount++;
  });

  // Sanity: fetch has not fired yet (no intersection triggered)
  expect(fetchCount).toBe(0);

  const observersBeforeRefresh = MockIntersectionObserver.instances.length;

  element.refresh();
  // Sync chain — refresh → fetch → render all fire synchronously, no zone gating
  expect(fetchCount).toBe(1);
  expect(renderCount).toBe(1);

  // No new IntersectionObserver instances were created by refresh()
  expect(MockIntersectionObserver.instances.length).toBe(observersBeforeRefresh);
});

test("refresh does not re-attach zone observers", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  element.setAttribute("loading", "lazy");
  container.appendChild(element);

  const initialCount = MockIntersectionObserver.instances.length;
  element.refresh();
  element.refresh();
  element.refresh();

  expect(MockIntersectionObserver.instances.length).toBe(initialCount);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: both lazy-bypass tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "test(ad-unit): cover refresh bypass of lazy-loading viewport zones"
```

---

## Task 10: Tests for nested refresh inside a lifecycle listener

**Files:**
- Test: `src/ad-unit.test.ts` (add tests to `describe("refresh()")`)

Validate the cycle-staleness invariant: a `refresh()` call from inside an `ad-unit:refresh` (or any lifecycle) listener preempts the outer cycle. The outer cycle's downstream stages do not fire; the inner cycle runs to completion.

- [ ] **Step 1: Write failing tests for nested refresh**

Append to `describe("refresh()")`:

```ts
test("refresh called inside ad-unit:refresh listener preempts outer cycle", () => {
  const element = document.createElement("ad-unit") as AdUnit;
  container.appendChild(element);

  const refreshCounts: number[] = [];
  let fetchCount = 0;
  let renderCount = 0;

  element.addEventListener("ad-unit:refresh", (e) => {
    refreshCounts.push((e as CustomEvent).detail.refreshCount);
    if (refreshCounts.length === 1) {
      element.refresh(); // nested
    }
  });
  element.addEventListener("ad-unit:fetch", () => {
    fetchCount++;
  });
  element.addEventListener("ad-unit:render", () => {
    renderCount++;
  });

  element.refresh();

  // Two refresh dispatches observed (outer + inner)
  expect(refreshCounts).toEqual([1, 2]);
  // Only the inner cycle's fetch/render run; outer is preempted
  expect(fetchCount).toBe(1);
  expect(renderCount).toBe(1);
});

test("refresh called inside ad-unit:connected listener preempts initial cycle", () => {
  const element = document.createElement("ad-unit") as AdUnit;

  let connectedFired = false;
  let fetchCount = 0;
  let renderCount = 0;
  const refreshCounts: number[] = [];

  element.addEventListener("ad-unit:connected", () => {
    if (!connectedFired) {
      connectedFired = true;
      element.refresh(); // nested inside connected
    }
  });
  element.addEventListener("ad-unit:refresh", (e) => {
    refreshCounts.push((e as CustomEvent).detail.refreshCount);
  });
  element.addEventListener("ad-unit:fetch", () => {
    fetchCount++;
  });
  element.addEventListener("ad-unit:render", () => {
    renderCount++;
  });

  container.appendChild(element);

  // Initial cycle's fetch/render were preempted; refresh cycle's ran instead
  expect(refreshCounts).toEqual([1]);
  expect(fetchCount).toBe(1);
  expect(renderCount).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test src/ad-unit.test.ts -t "refresh\\(\\)"`

Expected: both nested-refresh tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/ad-unit.test.ts
git commit -m "test(ad-unit): cover nested refresh preemption from inside a lifecycle listener"
```

---

## Task 11: Update JSDoc on `AdUnit` class to document `refresh()` and `refreshCount`

**Files:**
- Modify: `src/ad-unit.ts` (update class-level JSDoc block)

The class-level JSDoc currently documents the lifecycle stages and lazy-loading behavior but not refresh. Add a paragraph describing `refresh()`, the `ad-unit:refresh` event, and the `refreshCount` property so downstream adapter authors see the contract in their IDE tooltips.

- [ ] **Step 1: Update the class JSDoc block**

In `src/ad-unit.ts`, replace the class JSDoc block (currently lines 64–106) with:

```ts
/**
 * AdUnit web component - declarative ad unit lifecycle manager
 *
 * This component is vendor-agnostic. It manages shadow DOM, attribute
 * reflection, and content projection. Vendor-specific behavior (Prebid,
 * GAM, etc.) is handled by adapters that listen to ad-unit events.
 *
 * ## Lifecycle
 *
 * Stages dispatch in order: `ad-unit:connected` → `ad-unit:fetch` → `ad-unit:render`.
 * Each stage dispatches as an {@link AdUnitLifecycleEvent}. Listeners can call
 * `event.waitUntil(promise)` to hold progression to the next stage until the
 * promise settles. When multiple listeners add waitUntil promises, all are
 * awaited via `Promise.all` before advancing.
 *
 * When no listener calls `waitUntil`, stages dispatch synchronously in the
 * same call stack — no microtask overhead is introduced.
 *
 * Additional observable state:
 * - {@link blocked} property — `true` while any stage is awaiting waitUntil promises
 * - `ad-unit:stage-blocked` / `ad-unit:stage-unblocked` events — signal transitions
 * - `ad-unit:error` event — fires when a waitUntil promise rejects; halts lifecycle
 *
 * When `loading="lazy"`, built-in listeners attach `waitUntil(viewport-zone-promise)`
 * to gate `ad-unit:fetch` on the fetch zone and `ad-unit:render` on the render zone.
 * These compose with user-supplied waitUntil promises.
 *
 * ## Refresh
 *
 * Call {@link refresh} to kick off a new cycle: dispatches `ad-unit:refresh`,
 * then chains into `ad-unit:fetch` → `ad-unit:render` using the same waitUntil
 * machinery. Refresh bypasses lazy-loading viewport gates — it is an explicit
 * trigger. A `refresh()` call while a cycle is in flight aborts the old cycle
 * cleanly and starts fresh.
 *
 * {@link refreshCount} increments by 1 immediately before each `ad-unit:refresh`
 * dispatches, and the value is carried on every lifecycle event's `detail.refreshCount`
 * so adapters can distinguish first-load (`0`) from the N-th refresh.
 *
 * Refresh scheduling (timers, viewability gates, max-count enforcement) is an
 * adapter concern — this component exposes only the trigger primitive.
 *
 * @example
 * ```html
 * <ad-unit code="header-ad" sizes="728x90,970x250" pos="1" gpid="/1234/homepage/header">
 * </ad-unit>
 * ```
 *
 * @attr code - Unique identifier for this ad unit
 * @attr sizes - Banner sizes as "WxH,WxH" or JSON array format
 * @attr format - ORTB format objects as alternative to sizes (takes precedence)
 * @attr pos - OpenRTB position (0=unknown, 1=ATF, 3=BTF, 4=header, 5=footer, 6=sidebar, 7=fullscreen)
 * @attr name - Banner name for debugging
 * @attr gpid - Global Placement ID for first-party data
 * @attr loading - "eager" (default) or "lazy" for IntersectionObserver-based viewport detection
 * @attr fetch-margin - rootMargin for the fetch zone observer (default "200%")
 * @attr render-margin - rootMargin for the render zone observer (default "150%")
 */
```

- [ ] **Step 2: Run the build + lint to verify no doc issues**

Run: `bun run lint`

Expected: clean exit.

Run: `bun run build`

Expected: builds `dist/` without errors.

- [ ] **Step 3: Run the full test suite**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/ad-unit.ts
git commit -m "docs(ad-unit): document refresh() method and refreshCount property"
```

---

## Task 12: Final verification and PR-readiness check

**Files:** (no changes — just verification)

- [ ] **Step 1: Run full test suite with coverage**

Run: `bun run test:coverage`

Expected: all tests pass. Review coverage output — `src/ad-unit.ts` should show high coverage for the new surface (`refresh`, `#runRefreshStage`, `refreshCount` getter, stage-chain staleness paths).

- [ ] **Step 2: Run lint and formatter**

Run: `bun run lint`

Expected: clean exit. If any warnings, run `bun run lint:fix` and inspect the diff.

- [ ] **Step 3: Run build to verify declarations are generated correctly**

Run: `bun run build`

Expected: builds `dist/index.js` and `dist/index.d.ts`. Inspect `dist/index.d.ts` to confirm `refresh`, `refreshCount`, and the updated `AdUnitLifecycleDetail` type are exported.

```bash
grep -E "refresh|refreshCount" dist/index.d.ts
```

Expected: lines showing `refresh(): void`, `readonly refreshCount: number`, and `refreshCount?: number` in `AdUnitLifecycleDetail`.

- [ ] **Step 4: Sanity-check the full test list**

Run: `bun test 2>&1 | tail -40`

Expected: summary line like `N pass  0 fail`. No skipped tests.

- [ ] **Step 5: Review commit history**

Run: `git log --oneline main..HEAD`

Expected: ordered commits matching the task sequence:
- `docs: add design spec for refresh() method (issue #6)`
- `fix(ad-unit): guard finalize against stale-cycle blockedStages leak`
- `refactor(ad-unit): parameterize lifecycle stages with cycle source`
- `feat(ad-unit): add refreshCount property and detail field`
- `feat(ad-unit): add refresh() method and ad-unit:refresh event`
- `test(ad-unit): cover refreshCount increment and persistence`
- `test(ad-unit): cover waitUntil, error, and stage-blocked/unblocked on ad-unit:refresh`
- `test(ad-unit): cover refresh() no-op on disconnected element`
- `test(ad-unit): cover abort-and-restart semantics when refresh is called mid-flight`
- `test(ad-unit): cover refresh bypass of lazy-loading viewport zones`
- `test(ad-unit): cover nested refresh preemption from inside a lifecycle listener`
- `docs(ad-unit): document refresh() method and refreshCount property`

- [ ] **Step 6: Stop and hand off**

Ready for PR. Do not push or create the PR yet — user will instruct on timing, target branch, and body copy.

---

## Acceptance criteria mapping (from issue #6)

- ✅ `refresh()` method exists on the AdUnit element — Task 4
- ✅ Calling `refresh()` dispatches `ad-unit:refresh` event — Task 4
- ✅ Event has correct `detail`, `bubbles`, `composed` — Task 4. `cancelable: false` (override — see spec motivation) — Task 4
- ✅ Can be called multiple times (not once-per-lifecycle like fetch/render) — Tasks 5, 8
- ✅ All behavior covered by tests — Tasks 1 + 3 + 5–10 collectively
