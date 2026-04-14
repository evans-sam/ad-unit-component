# refresh() method and ad-unit:refresh event

> Design spec for [issue #6](https://github.com/evans-sam/ad-unit-component/issues/6)

## Summary

Add a `refresh()` method to `<ad-unit>` that kicks off a new lifecycle cycle — dispatching `ad-unit:refresh` → `ad-unit:fetch` → `ad-unit:render` — reusing the existing `waitUntil` stage machinery introduced in issue #5. Refresh is externally-triggered only: the component exposes the method, publishers and adapters call it. No internal scheduling, no viewability gating, no max-count enforcement — those are out of scope for the primitive and belong to a future refresh adapter.

Refresh semantics align with v2's `refreshSlot(force: true)`: the method aborts any in-flight cycle (zone waiters and pending `waitUntil` promises are marked stale via cycle-id bump) and starts a fresh one. Refresh is about re-running the auction (Prebid / apstag) and letting adapters decide whether to destroy-and-rebuild or reuse the underlying GPT slot.

## Motivation

Issue #6 addresses user story 15 — "refresh ad unit programmatically." Publishers need a way to re-run the auction for an ad unit without removing and re-inserting the element (which would tear down adapter state and re-fire `ad-unit:connected`). Timed refresh on a fixed interval, refresh on user action (e.g., filter change on a search page), and auction-level refresh across multiple slots are the motivating use cases.

The current lifecycle only fires once per DOM connection: `connected → fetch → render`. There is no primitive for "do it again." This spec adds that primitive.

## Public API

### `refresh()` method

```ts
refresh(): void
```

Triggers a new lifecycle cycle. No arguments, no return value.

Behavior:

- If the element is not connected: `console.warn` and no-op.
- Otherwise: aborts the current cycle (if any) and starts a new one dispatching `ad-unit:refresh` → `ad-unit:fetch` → `ad-unit:render`.
- Increments `refreshCount` just before dispatching `ad-unit:refresh`, so the event detail carries the new value.
- Returns synchronously. The dispatched stages run synchronously if no listener calls `waitUntil`, consistent with the existing eager-mode invariant.

### `refreshCount` property

```ts
get refreshCount(): number
```

Readonly. `0` when the element is first constructed. Incremented by `1` on each call to `refresh()` immediately before `ad-unit:refresh` is dispatched. Not reset by disconnect / reconnect of the same instance — `refreshCount` is a property of the element object, not the cycle. (If the DOM removes and garbage-collects the element, a freshly-constructed replacement starts at `0`.)

### `ad-unit:refresh` event

Dispatches as an `AdUnitLifecycleEvent`. Same contract as `ad-unit:connected` / `ad-unit:fetch` / `ad-unit:render`:

- `bubbles: true`
- `composed: true`
- `cancelable: false`
- Supports `event.waitUntil(promise)` to gate progression into `ad-unit:fetch`

Overrides the wording in issue #6 that specifies `cancelable: true`. The original issue text predates issue #5's migration from `preventDefault` / `proceed()` to `waitUntil`. Consistency with the other lifecycle events takes precedence.

### `AdUnitLifecycleDetail.refreshCount`

```ts
interface AdUnitLifecycleDetail {
  code?: string;
  sizes?: number[][];
  gpid?: string | null;
  pos?: number | null;
  format?: BannerFormat[] | null;
  container?: HTMLDivElement;
  refreshCount?: number;  // new
}
```

All lifecycle events (`connected`, `disconnected`, `refresh`, `fetch`, `render`) carry the current `refreshCount` in their detail. Adapters that only listen to `fetch` or `render` can distinguish first-load from N-th refresh without subscribing to `ad-unit:refresh` separately.

## Internal implementation

### `refresh()` method body

```ts
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

- `#zoneController?.abort()` — causes any pending lazy-zone promises from the prior cycle to reject with `AbortError`. `#awaitStage` already filters `AbortError` out of `ad-unit:error`, so the aborted cycle goes quiet.
- `#cycleId++` — the stale check in `#awaitStage.finalize()` now treats the old cycle as stale. Old pending `waitUntil` promises resolve into no-ops.
- `#blockedStages.clear()` — drops stale entries from `{ "ad-unit:connected", "ad-unit:fetch", "ad-unit:render" }`. The new cycle will add its own entries as its stages block. `adUnit.blocked` immediately reflects the new cycle only.
- `#zoneController = new AbortController()` — ready for the new cycle's lazy-zone integration (which refresh does not use, but disconnect will).
- `#refreshCount++` — bumped before `#runRefreshStage` so `#dispatchLifecycle` reads the new value.

`#aborted` is not touched. It is strictly a "disconnected" signal; refresh keeps the element connected.

### Cycle-staleness invariant

Because refresh can be invoked synchronously from inside a lifecycle-event listener (nested refresh), every stage runner must guard against mid-dispatch preemption. The contract:

1. Each `#runXStage` captures `this.#cycleId` at the top as a local `cycleId`.
2. Each stage runs its `#dispatchLifecycle` call.
3. After dispatch returns (listeners have run; any one of them may have called `refresh()`), the stage checks `if (this.#aborted || this.#cycleId !== cycleId) return;` before touching `#blockedStages`, attaching lazy waiters, calling downstream stages, or calling `#awaitStage`. Failing this check means the current frame belongs to an old, preempted cycle — drop it.
4. Downstream stage calls and `#awaitStage` receive `cycleId` as a parameter, not captured live. `#awaitStage` uses the passed value for its `isStale` check; it does not read `this.#cycleId` at construction time.
5. `#awaitStage`'s `finalize()` performs its stale check **before** touching `#blockedStages.delete(event.type)` (see [Correctness fix](#correctness-fix-to-awaitstagefinalize) below).

This guarantees: a nested `refresh()` inside a listener causes the inner cycle to run to completion (or block) synchronously, and when control returns to the outer stage, the outer stage detects the preemption and drops its frame without dispatching spurious `stage-blocked` events or polluting `#blockedStages`.

### New stage runner

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
  this.#awaitStage(refreshEvent, cycleId, () => this.#runFetchStage("refresh", cycleId));
}
```

Structurally mirrors `#runConnectedStage()` but:

- Does not attach a lazy fetch-zone waiter (refresh bypasses viewport gating).
- Passes `"refresh"` into the next stage to skip the render-zone waiter too.

### Parameterize existing stages with `source` and `cycleId`

`#runConnectedStage`, `#runFetchStage`, `#runRenderStage` all adopt the cycle-staleness pattern and thread `cycleId` through. Existing stages also gain a `source: "initial" | "refresh"` parameter so lazy-zone waiters attach only on initial cycles:

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
  this.#awaitStage(connectedEvent, cycleId, () => this.#runFetchStage("initial", cycleId));
}

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
  this.#awaitStage(fetchEvent, cycleId, () => this.#runRenderStage(source, cycleId));
}

#runRenderStage(source: "initial" | "refresh", cycleId: number): void {
  if (this.#aborted || this.#cycleId !== cycleId) return;
  const renderEvent = this.#dispatchLifecycle("ad-unit:render");
  renderEvent.endDispatch();
  if (this.#aborted || this.#cycleId !== cycleId) return;
  if (renderEvent.pending.length === 0) return;
  this.#awaitStage(renderEvent, cycleId, () => {
    /* terminal stage */
  });
}
```

`#runConnectedStage` passes `"initial"` into `#runFetchStage`. `#runRefreshStage` passes `"refresh"`. Both pre- and post-dispatch guards are present: the pre-guard protects the async-path entry (when `#awaitStage`'s `onResolved` fires much later), the post-guard protects the sync path (when a listener called `refresh()` during dispatch).

Rendering (the shadow DOM extension point in `render()`) is not called again on refresh — the container stays put, adapters decide whether to clear it or reuse it.

### `#awaitStage` signature change

```ts
#awaitStage(
  event: AdUnitLifecycleEvent,
  cycleId: number,
  onResolved: () => void,
): void {
  const stage = this.#stageName(event.type);
  this.#blockedStages.add(event.type);
  this.dispatchEvent(new CustomEvent("ad-unit:stage-blocked", { ... }));

  const isStale = () => this.#aborted || this.#cycleId !== cycleId;

  const finalize = () => {
    if (isStale()) return;                  // moved up — see correctness fix
    this.#blockedStages.delete(event.type);
    this.dispatchEvent(new CustomEvent("ad-unit:stage-unblocked", { ... }));
  };

  Promise.all(event.pending).then(
    () => { finalize(); if (isStale()) return; onResolved(); },
    (error) => { finalize(); if (isStale()) return; /* error dispatch */ },
  );
}
```

`cycleId` is now a parameter rather than captured from `this.#cycleId`. This ensures the stale check compares against the cycle that *started* this `#awaitStage`, not whatever cycle happens to be current when the stage runner finally invokes it.

### Detail construction

`#dispatchLifecycle` already reads instance state fresh when building the detail. Add `refreshCount: this.#refreshCount`:

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
  return event;
}
```

All existing lifecycle events (`connected`, `disconnected`, `fetch`, `render`) now carry `refreshCount` too — `0` for the initial cycle, `N` during the N-th refresh cycle. Because `#dispatchLifecycle` reads fresh state on each call, no per-stage plumbing is needed.

## Correctness fix to `#awaitStage.finalize()`

The current implementation deletes from `#blockedStages` before checking staleness:

```ts
// current
const finalize = () => {
  this.#blockedStages.delete(event.type);
  if (isStale()) return;
  this.dispatchEvent(new CustomEvent("ad-unit:stage-unblocked", ...));
};
```

Under refresh, this breaks. Consider:

1. Cycle N dispatches `ad-unit:fetch`, listener calls `waitUntil(slow)`. `#blockedStages = { "ad-unit:fetch" }`.
2. `refresh()` is called. `#cycleId` bumps to `N+1`. `#blockedStages.clear()`. `#runRefreshStage` → ... → `#runFetchStage("refresh")` fires `ad-unit:fetch` with a new listener calling `waitUntil(fast)`. `#blockedStages = { "ad-unit:fetch" }` (entry belongs to cycle `N+1`).
3. Cycle `N`'s `slow` promise resolves. `finalize` runs. `#blockedStages.delete("ad-unit:fetch")` — erases cycle `N+1`'s entry. Then `isStale() === true`, returns without firing stage-unblocked.
4. `adUnit.blocked` now returns `false` even though cycle `N+1` is still waiting on `fast`.

Fix — move the stale check before the delete:

```ts
const finalize = () => {
  if (isStale()) return;       // moved up
  this.#blockedStages.delete(event.type);
  this.dispatchEvent(new CustomEvent("ad-unit:stage-unblocked", ...));
};
```

The stale cycle's `finalize` no longer touches `#blockedStages`. The new cycle's entry is cleared when its own `finalize` runs (or by `#blockedStages.clear()` at the next `refresh()` / `connectedCallback`).

This is a latent bug in the current code's reconnect path (remove + re-append while a `waitUntil` is pending, with the new cycle blocking on the same event type). Not currently hit by tests, but will be hit by refresh. Fixing it as part of this work.

## Edge cases

### Refresh while mid-flight

Covered by `#cycleId` bump. Old cycle's pending `Promise.all` resolves into a no-op (`isStale()` short-circuits `finalize`). No `stage-unblocked` fires for the aborted cycle — consistent with disconnect behavior. No `ad-unit:error` fires unless the rejection is not an `AbortError`; even then, the stale check gates it.

### Refresh on disconnected element

`this.isConnected === false`. Console-warn with the element's code, return. No event dispatched. `refreshCount` does not increment.

### Refresh called from inside an `ad-unit:refresh` (or any lifecycle) listener

Calling `refresh()` from inside a listener bumps `#cycleId` and `#refreshCount` synchronously, then runs the nested `#runRefreshStage` (which dispatches a new `ad-unit:refresh` with its own detail snapshot). Once the nested cycle completes or blocks, the original listener's stack resumes.

Any `waitUntil` called on the *outer* event still pushes to that event's `#pending` array — `#dispatching` is per-event-instance, so the call is legal. However, the outer stage's post-dispatch guard detects that `this.#cycleId` has changed and early-returns before calling `#awaitStage`. Those pending promises on the abandoned outer event have no subscribers and are garbage-collected.

Observable result: two `ad-unit:refresh` dispatches, one nested inside the other. The outer's `detail.refreshCount` is one less than the inner's (each detail snapshot is taken at dispatch time). The outer cycle's downstream fetch/render never runs; the inner cycle's does.

This pattern generalizes to any lifecycle listener: a listener on `ad-unit:connected`, `ad-unit:fetch`, or `ad-unit:render` that calls `refresh()` triggers the same preemption behavior. The outer cycle drops gracefully; the inner runs to completion.

### Refresh + lazy loading

Lazy-zone waiters are `source === "initial"` only. A `refresh()` on a `loading="lazy"` element that is currently offscreen still fires `fetch` and `render` — the publisher asked for a refresh; the component honors that.

If the publisher wants in-view-only refresh, they install an `IntersectionObserver` themselves and gate the `refresh()` call. (This is what a future refresh adapter will do as a default policy.)

### Refresh inside `waitUntil` promise

Same as "mid-flight" — the old cycle's `#cycleId` is stale by the time `refresh()`'s effects take hold. Refresh semantics are unaffected.

### Error during refresh stage

A listener on `ad-unit:refresh` that calls `waitUntil(Promise.reject(...))` halts the cycle. `ad-unit:error` fires with `detail.stage === "refresh"`. `ad-unit:fetch` does not fire. `refreshCount` stays at the incremented value (the refresh was attempted; the cycle failed).

### Rapid successive refreshes

Each call bumps `#cycleId`. The component only advances the most-recent cycle. No coalescing — every `refresh()` invocation gets its own `ad-unit:refresh` dispatch. Publishers who want rate-limiting implement it in their calling code (or in a refresh adapter).

## Refresh adapter contract

A future refresh adapter — external module, not part of the component — is the intended home for policy:

- Auto-scheduling refreshes on a configurable interval
- Viewability-gated refresh (start / stop timer based on `IntersectionObserver`)
- Max refresh count enforcement
- Viewable-time-weighted intervals (v2's `inview_interval`)
- Auction-level coordination (refresh all slots in one batch)

The adapter interfaces with `<ad-unit>` using only public DOM surface:

| Adapter need                            | Component surface                              |
|-----------------------------------------|------------------------------------------------|
| Trigger a refresh                       | `unit.refresh()`                               |
| Observe initial load                    | `ad-unit:connected`, `ad-unit:render` events   |
| Observe programmatic refresh            | `ad-unit:refresh` event                        |
| Snapshot current cycle count            | `unit.refreshCount`                            |
| Avoid triggering during pending cycle   | `unit.blocked` getter                          |
| Rate-limit or delay refresh             | `event.waitUntil(policyPromise)` on `ad-unit:refresh` |
| Tear down timers on element removal     | `ad-unit:disconnected` event                   |
| Distinguish first-load from refresh     | `event.detail.refreshCount`                    |

The component makes zero assumptions about adapter policy. The adapter makes zero assumptions about component-internal state beyond the public surface above.

## Testing strategy

Tests use the existing `bun:test` + happy-dom registrator setup. Add a `describe("refresh()")` block in `src/ad-unit.test.ts` covering:

### Basic dispatch

1. `refresh()` dispatches `ad-unit:refresh` on the element.
2. Event is an `AdUnitLifecycleEvent`, `bubbles: true`, `composed: true`, `cancelable: false`.
3. Document-level listener (bubbles + composed) receives the refresh event.
4. Event detail carries `code`, `sizes`, `gpid`, `pos`, `format`, `container`, and `refreshCount`.

### Refresh count

5. `refreshCount` is `0` before any `refresh()` call.
6. `refreshCount` is `1` after the first `refresh()`, `2` after the second.
7. `refreshCount` in the `ad-unit:refresh` detail matches the post-increment value.
8. `refreshCount` in subsequent `ad-unit:fetch` / `ad-unit:render` details matches.
9. `refreshCount` in `ad-unit:connected` is `0` on initial connect.
10. `refreshCount` persists across disconnect / reconnect of the same element (verifies counter is instance state, not cycle state).

### Cycle chain

11. `refresh()` fires `ad-unit:refresh` → `ad-unit:fetch` → `ad-unit:render` in order.
12. Synchronous chain: no listener calls `waitUntil`, all three fire in the same tick.
13. `waitUntil` on `ad-unit:refresh` defers `ad-unit:fetch` until the promise resolves.
14. Rejection on `ad-unit:refresh` `waitUntil` fires `ad-unit:error` with `detail.stage === "refresh"`, halts cycle.

### Mid-flight interruption

15. `refresh()` called while initial `ad-unit:fetch` is blocked: old cycle halted, new cycle fires `ad-unit:refresh` → `ad-unit:fetch` → `ad-unit:render`. Old `ad-unit:fetch` `waitUntil` resolving later does not fire any further events.
16. `refresh()` called twice in rapid succession: two `ad-unit:refresh` dispatches, only the latest cycle's fetch/render complete.
17. `adUnit.blocked` tracks only the newest cycle.

### Lazy loading

18. `refresh()` on a `loading="lazy"` element that is offscreen still fires `ad-unit:fetch` and `ad-unit:render` (zones bypassed).
19. `refresh()` does not create new `IntersectionObserver` instances.

### Disconnected element

20. `refresh()` on a disconnected element: console-warn, no events dispatched, `refreshCount` unchanged.

### Recursive refresh

21. `refresh()` called from inside an `ad-unit:refresh` listener: both dispatches observed, outer cycle's fetch/render do not fire, inner cycle completes.

### Correctness fix for `finalize`

22. Old cycle's blocked `ad-unit:fetch` promise resolving after refresh does not clear `#blockedStages` for the new cycle (covered by asserting `adUnit.blocked === true` until the new cycle's own promise resolves).

### Listener isolation

23. A listener on only `ad-unit:render` (not `ad-unit:refresh`) sees `event.detail.refreshCount > 0` after `refresh()` — validates the adapter-contract promise that `refreshCount` is observable from any stage.

## Files modified

- `src/ad-unit.ts`
  - Add `#refreshCount` field, public `refreshCount` getter.
  - Add `refresh()` public method.
  - Add `#runRefreshStage()`.
  - Parameterize `#runFetchStage` and `#runRenderStage` with `source: "initial" | "refresh"`.
  - Update `#runConnectedStage` to pass `"initial"` to `#runFetchStage`.
  - Add `refreshCount` to `AdUnitLifecycleDetail` and to `#dispatchLifecycle` detail construction.
  - Fix `#awaitStage.finalize` stale-check order.
  - Update JSDoc on the class to document `refresh()`, `refreshCount`, and `ad-unit:refresh`.

- `src/ad-unit.test.ts`
  - New `describe("refresh()")` block with cases above.
  - Update existing lifecycle-event detail tests to assert `refreshCount: 0` on initial cycle.

- `src/index.ts`
  - No new exports. `AdUnitLifecycleDetail` already exported; its new `refreshCount` field comes along.

## Out of scope

- **Auto-refresh scheduling.** No `refresh-interval` attribute, no internal `setInterval`. Publishers and adapters own scheduling.
- **Viewability-gated refresh.** No in-view tracking, no `inview_interval` config. Adapters wire up their own `IntersectionObserver`.
- **Max refresh count enforcement.** No `refresh-max` attribute. Adapters enforce caps.
- **Auction-level refresh coordination.** Multi-slot batching is an adapter concern (v2's `refreshAuctionAndSlotsByName`).
- **Cancelability for refresh.** The method itself cannot be vetoed by a listener. A refresh adapter that wants to centralize policy exposes its own API (e.g., `adapter.requestRefresh(unit)`) that calls `unit.refresh()` conditionally. Publishers bypassing the adapter to call `unit.refresh()` directly is a deliberate escape hatch.
- **`renderedAt` / `fetchedAt` timestamps on the element.** Adapters snapshot `performance.now()` at `ad-unit:render` if they need them.

## References

- Previous spec: `docs/superpowers/specs/2026-04-14-waituntil-lifecycle-coordination-design.md` (issue #5)
- Previous spec: `docs/superpowers/specs/2026-04-14-viewport-detection-design.md` (issue #4)
- V2 precedent: `AdSlotService/adSlot.ts#refreshSlot` — forced-refresh semantics that inspired the abort-and-restart model here.
- V2 precedent: `AdSlotService/adSlot.ts#setRefreshInterval` — the auto-scheduling machinery that will live in a future refresh adapter, not in this component.
