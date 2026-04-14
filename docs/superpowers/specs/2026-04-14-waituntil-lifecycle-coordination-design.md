# waitUntil Lifecycle Coordination

> Design spec for [issue #5](https://github.com/evans-sam/ad-unit-component/issues/5)

## Summary

Replace the cancelable-event-plus-`proceed()` model originally proposed in issue #5 with the platform-standard `event.waitUntil(promise)` pattern (used by Service Workers' `ExtendableEvent`). Listeners on `ad-unit:connected`, `ad-unit:fetch`, and `ad-unit:render` may call `event.waitUntil(promise)` to hold advancement to the next stage until all registered promises settle. Multiple adapters compose naturally via `Promise.all`. Lazy loading is refactored to use the same primitive via built-in internal waiters — no separate observer bookkeeping.

## Motivation

Issue #5's original proposal (`preventDefault()` + `adUnit.proceed()`) has three coordination problems:

1. `preventDefault()` must be called *synchronously* — a well-known JS gotcha that breaks when adapters want to decide asynchronously.
2. Multiple adapters blocking the same stage have no clean coordination story — "who calls proceed first wins" is a footgun.
3. "Is this stage currently blocked?" is only observable via `event.defaultPrevented` during dispatch, not afterward.

`waitUntil` is the web-platform answer ([ExtendableEvent.waitUntil](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil), [WhatWG discussion](https://github.com/whatwg/html/issues/9540)). One primitive cleanly handles: auction-blocks-render, consent-blocks-fetch, lazy-loading-blocks-fetch-until-in-viewport.

## API Surface

### `AdUnitLifecycleEvent`

New class extending `CustomEvent`. All lifecycle events (`ad-unit:connected`, `ad-unit:fetch`, `ad-unit:render`) dispatch as instances of this class.

```ts
class AdUnitLifecycleEvent extends CustomEvent<AdUnitLifecycleDetail> {
  #pending: Promise<unknown>[] = [];
  #dispatching = false;

  waitUntil(promise: Promise<unknown>): void {
    if (!this.#dispatching) {
      throw new Error(
        "waitUntil() must be called during event dispatch",
      );
    }
    this.#pending.push(Promise.resolve(promise));
  }

  get pending(): readonly Promise<unknown>[] {
    return this.#pending;
  }
}
```

The component sets `#dispatching = true` before `dispatchEvent`, resets to `false` after. Calling `waitUntil` outside that window throws.

Events are no longer `cancelable`. `preventDefault()` is not the block primitive; `waitUntil` is.

### Element property: `adUnit.blocked`

Readonly boolean. `true` while any `Promise.all` chain is outstanding. `false` otherwise (including after rejection or disconnect). Useful for late-attached listeners and debugging.

### State-change events

- `ad-unit:stage-blocked` — `detail: { stage: "connected" | "fetch" | "render" }`. Fired when a stage's `waitUntil` queue transitions from empty to non-empty and the component begins awaiting. Not `cancelable`, not `composed`-sensitive (keep same flags as lifecycle events).
- `ad-unit:stage-unblocked` — same `detail` shape. Fired when all pending promises for that stage settle (resolved or rejected).
- `ad-unit:error` — `detail: { stage, error }`. Fired when any `waitUntil` promise rejects. Halts the lifecycle — no further stages dispatch.

## Dispatch Logic

Sync-until-blocked. The component fires all lifecycle events synchronously in the same call stack when no listener calls `waitUntil`. Only once a waiter registers does execution yield to microtasks.

```ts
connectedCallback() {
  this.render();
  this.#aborted = false;
  this.#zoneController = new AbortController();
  this.#runConnectedStage();
}

#runConnectedStage() {
  const connectedEvent = this.#dispatch("ad-unit:connected");
  if (this.loading === "lazy") {
    connectedEvent.waitUntil(this.#awaitZone("fetch"));
  }
  if (connectedEvent.pending.length === 0) {
    this.#runFetchStage();
    return;
  }
  this.#settle(connectedEvent, () => this.#runFetchStage());
}

#runFetchStage() {
  if (this.#aborted) return;
  const fetchEvent = this.#dispatch("ad-unit:fetch");
  if (this.loading === "lazy") {
    fetchEvent.waitUntil(this.#awaitZone("render"));
  }
  if (fetchEvent.pending.length === 0) {
    this.#runRenderStage();
    return;
  }
  this.#settle(fetchEvent, () => this.#runRenderStage());
}

#runRenderStage() {
  if (this.#aborted) return;
  const renderEvent = this.#dispatch("ad-unit:render");
  if (renderEvent.pending.length === 0) return;
  this.#settle(renderEvent, () => {
    /* terminal stage — no further dispatch, but settle to flip blocked flag back */
  });
}

#settle(event: AdUnitLifecycleEvent, onResolved: () => void) {
  this.#setBlocked(event.type);
  Promise.all(event.pending).then(
    () => {
      this.#setUnblocked(event.type);
      if (this.#aborted) return;
      onResolved();
    },
    (error) => {
      this.#setUnblocked(event.type);
      if (this.#aborted || error?.name === "AbortError") return;
      this.#dispatchError(event.type, error);
    },
  );
}
```

### Why the explicit stage functions instead of an `async` loop

An `async` function `await`-ing `Promise.all([])` still yields a microtask because `await` wraps non-thenables in `Promise.resolve`. That would make the zero-waiter eager path asynchronous — a regression from today. The empty-check before settle keeps the fully synchronous path intact.

### Error handling

Any rejection from `waitUntil` halts advancement, fires `ad-unit:error`, flips `blocked` back to `false`. The adapter can inspect `detail.stage` and `detail.error` and decide whether to retry (by re-adding the element or calling a hypothetical future `retry()` — not in scope).

`AbortError` from the internal zone-promise (triggered by `disconnectedCallback`) is filtered out — disconnecting is not an error.

## Zone Adapter

Replaces the `#fetchObserver` / `#renderObserver` / `#fetchFired` / `#renderFired` fields from issue #4's implementation.

```ts
#zoneController: AbortController | null = null;

#awaitZone(zone: "fetch" | "render"): Promise<void> {
  const margin = zone === "fetch" ? this.fetchMargin : this.renderMargin;
  const attributeName = zone === "fetch" ? "fetch-margin" : "render-margin";
  const effectiveMargin = this.#resolveMargin(zone, margin);
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
      reject(new Error(
        `[ad-unit "${this.code}"] Invalid ${attributeName} "${margin}": ${
          error instanceof Error ? error.message : error
        }`,
      ));
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

`#resolveMargin(zone, margin)` preserves the fetch-clamp-to-render validation from issue #4 — same warning text, same clamping rule, same mixed-unit skip. Invalid-margin detection now surfaces via `ad-unit:error` instead of a synchronous throw from `connectedCallback`.

## Teardown

```ts
disconnectedCallback() {
  this.#aborted = true;
  this.#zoneController?.abort();
  this.#zoneController = null;
  this.#dispatch("ad-unit:disconnected");
}
```

`#aborted` guards against late `#runFetchStage` / `#runRenderStage` calls from pending promises. Any outstanding zone promises reject with `AbortError` and are filtered from `ad-unit:error`.

`ad-unit:disconnected` does not participate in the `waitUntil` chain — it is a teardown signal with no downstream stage to hold. It dispatches as an `AdUnitLifecycleEvent` for type consistency, but any `waitUntil` calls on it are effectively no-ops.

## Removed Fields / Behavior

From issue #4's implementation:

- `#fetchObserver`, `#renderObserver`, `#fetchFired`, `#renderFired` fields.
- `#setupObservers`, `#createObserver`, `#teardownObservers` methods.
- Separate eager/lazy branching in `connectedCallback` — both paths now run through `#runConnectedStage`.
- `cancelable: true` on lifecycle events (flipped to `false`).

The `loading`, `fetch-margin`, `render-margin` attributes and their reflecting getters/setters **remain** — lazy loading is still a declarative feature; its implementation just routes through `waitUntil`.

## Issue #5 Acceptance Criteria Reconciliation

Issue #5's original criteria referenced `preventDefault()` and `adUnit.proceed()`. This spec replaces them with the equivalent `waitUntil` semantics:

- ~~`preventDefault()` on `ad-unit:fetch` prevents `ad-unit:render` from auto-firing~~ → `event.waitUntil(promise)` on `ad-unit:fetch` holds `ad-unit:render` until the promise settles.
- ~~`preventDefault()` on `ad-unit:render` prevents rendering from proceeding~~ → `event.waitUntil(promise)` on `ad-unit:render` keeps `adUnit.blocked === true` until the promise settles (no downstream event to hold, but the blocked state is observable).
- ~~`proceed()` method retries the blocked lifecycle stage~~ → the promise resolving *is* proceed. No manual call needed.
- ~~Calling `proceed()` when not blocked is a no-op~~ → N/A.
- ✅ All behavior covered by tests.

Issue #5 will be updated to reflect the new API before implementation.

## Testing Strategy

Reuse the IntersectionObserver mock from issue #4's test suite. Add tracking of per-observer `disconnect()` calls so tests can assert cleanup.

### New test cases

1. **Sync path, no waiters**: `connected` / `fetch` / `render` all fire in the same synchronous tick when no listener calls `waitUntil`. Verified by a counter read immediately after `connectedCallback` runs.
2. **Single resolved `waitUntil`**: next stage fires after one microtask.
3. **Multiple waiters compose**: two listeners on `ad-unit:fetch` each call `waitUntil`. Render fires only after both resolve.
4. **Rejection halts lifecycle**: `waitUntil(Promise.reject(new Error("x")))` on fetch. `ad-unit:render` never fires; `ad-unit:error` fires with `detail.stage === "fetch"`, `detail.error.message === "x"`.
5. **`adUnit.blocked` reflects state**: `false` before connect, `true` while waiter pending, `false` after resolution or rejection.
6. **`stage-blocked` / `stage-unblocked` events**: fire around blocked transitions with correct `detail.stage`.
7. **`waitUntil` outside dispatch throws**: saving an event reference and calling `waitUntil` later throws.
8. **Lazy loading via internal waiter**: element off-screen — `ad-unit:connected` fires, `:fetch` does not. Trigger fetch-zone intersection: `:fetch` fires. Trigger render-zone: `:render` fires.
9. **Lazy + user `waitUntil` compose**: `loading="lazy"` plus a user listener on fetch calling `waitUntil(auctionPromise)`. Render waits for both render zone *and* auction.
10. **Disconnect aborts pending zone promises**: element disconnected while awaiting render zone. No `ad-unit:render`, no `ad-unit:error`.
11. **Invalid margin surfaces via `ad-unit:error`**: bad `fetch-margin` value. `ad-unit:error` fires with wrapped message `[ad-unit "code"] Invalid fetch-margin "banana": ...`.
12. **Reconnect replays lifecycle**: remove + re-append fires events again from connected.
13. **Fetch margin < render margin**: same warning and clamping as issue #4. No regression.
14. **Event shape preserved**: lifecycle events still carry `{ code, sizes, gpid, pos, format, container }` in detail. Still `bubbles: true`, `composed: true`. Now `cancelable: false`.

### Updated test cases

Issue #4 tests that asserted `connectedCallback` throws synchronously for invalid margins change to assert `ad-unit:error` fires instead.

## Files Modified

- `src/ad-unit.ts` — add `AdUnitLifecycleEvent` class, replace observer bookkeeping with `#awaitZone` + `#runXStage` chain, add `blocked` property, dispatch new state events, error routing.
- `src/ad-unit.test.ts` — add new test groups, update invalid-margin tests to expect `ad-unit:error`.
- `src/index.ts` — export `AdUnitLifecycleEvent` class for external type use.

## Out of Scope

- **`retry()` method** — re-running the lifecycle after an error. Adapters can re-attach the element; dedicated retry API can follow if needed.
- **Timeouts** — `waitUntil` promises aren't auto-cancelled after a deadline. Adapters can wrap their own promises with timeouts.
- **Progress events** — no `ad-unit:progress` or similar mid-wait signals. `stage-blocked` / `stage-unblocked` are the observable surface.
- **Per-listener removal** — once a `waitUntil` promise is registered it can't be unregistered. If needed later, `AbortSignal` integration could be added.

## References

- [ExtendableEvent.waitUntil() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil)
- [Async Event Methods and preventDefault() — Rick Strahl](https://weblog.west-wind.com/posts/2023/Feb/16/Async-Event-Methods-and-preventDefault-in-JavaScript)
- [WhatWG HTML: event.waitUntil(promise) for async listeners](https://github.com/whatwg/html/issues/9540)
- [WhatWG DOM: async event listeners proposal](https://github.com/whatwg/dom/issues/1308)
- Previous spec: `docs/superpowers/specs/2026-04-14-viewport-detection-design.md` (issue #4)
