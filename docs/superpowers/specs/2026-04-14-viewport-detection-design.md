# Viewport Detection for Fetch/Render Zones

> Design spec for [issue #4](https://github.com/evans-sam/ad-unit-component/issues/4)

## Summary

Add IntersectionObserver-based viewport detection to `<ad-unit>`. When lazy loading is enabled, the component uses two IntersectionObservers to detect when the element enters configurable fetch and render zones, firing `ad-unit:fetch` and `ad-unit:render` events. When lazy loading is off (the default), both events fire synchronously on connect.

## Attributes

### `loading`

Controls whether viewport detection is observer-based or immediate.

| Value | Behavior |
|-------|----------|
| `"eager"` (default) | `ad-unit:fetch` and `ad-unit:render` fire synchronously in `connectedCallback` |
| `"lazy"` | Two IntersectionObservers detect viewport proximity; events fire once each when zones are entered |

Absence of the attribute is equivalent to `"eager"`. The value is read once in `connectedCallback`; changing it while connected has no effect until the next disconnect/reconnect cycle. Same applies to `fetch-margin` and `render-margin`.

### `fetch-margin`

CSS rootMargin string for the fetch zone observer. Accepts `px` or `%` values. Only used when `loading="lazy"`.

Default: `"200%"` (two full viewport heights).

### `render-margin`

CSS rootMargin string for the render zone observer. Accepts `px` or `%` values. Only used when `loading="lazy"`.

Default: `"150%"` (1.5 viewport heights).

### Constants

```ts
const DEFAULT_FETCH_MARGIN = "200%";
const DEFAULT_RENDER_MARGIN = "150%";
```

All three attributes are added to `observedAttributes`.

## Events

### `ad-unit:fetch`

Fired when the element enters the fetch zone. In eager mode, fires synchronously in `connectedCallback` after `ad-unit:connected`. In lazy mode, fires when the fetch observer's callback triggers.

### `ad-unit:render`

Fired when the element enters the render zone. Same dispatch rules as `ad-unit:fetch` but for the render zone.

### Event configuration

Both events use the same flags and detail shape as existing lifecycle events:

- `bubbles: true`
- `composed: true`
- `cancelable: true`
- `detail: { code, sizes, gpid, pos, format, container }`

### Event order (eager mode)

`ad-unit:connected` -> `ad-unit:fetch` -> `ad-unit:render` (all synchronous in `connectedCallback`).

### Event order (lazy mode)

`ad-unit:connected` fires synchronously. `ad-unit:fetch` and `ad-unit:render` fire asynchronously when their respective observers trigger.

**Critical invariant: fetch always fires before render.** If the element is already in view when connected (both observers trigger immediately), the render observer callback must check `#fetchFired` before dispatching. If fetch hasn't fired yet, the render callback dispatches `ad-unit:fetch` first, then `ad-unit:render`. This guarantees adapters always see fetch before render regardless of observer callback ordering.

## Observer Lifecycle

### Private fields

```ts
#fetchObserver: IntersectionObserver | null = null;
#renderObserver: IntersectionObserver | null = null;
#fetchFired = false;
#renderFired = false;
```

### `connectedCallback` (after existing `render()` + `ad-unit:connected`)

**Eager path** (`loading` is absent or `"eager"`):
1. Dispatch `ad-unit:fetch`
2. Dispatch `ad-unit:render`

**Lazy path** (`loading="lazy"`):
1. Reset guards: `#fetchFired = false`, `#renderFired = false`
2. Validate margins: if fetch margin < render margin (same unit), `console.warn` with context and clamp fetch = render. Mixed units skip the check.
3. Create fetch observer with `rootMargin: this.fetchMargin`. On intersection: if `!#fetchFired`, dispatch `ad-unit:fetch`, set `#fetchFired = true`, unobserve `this`.
4. Create render observer with `rootMargin: this.renderMargin`. On intersection: if `!#renderFired`, check `#fetchFired` — if fetch hasn't fired yet, dispatch `ad-unit:fetch` first (and set `#fetchFired = true`, unobserve from fetch observer). Then dispatch `ad-unit:render`, set `#renderFired = true`, unobserve `this`.
5. Both call `observe(this)`.
6. Observer construction is wrapped in try/catch. On error, wrap the message with `[ad-unit "${this.code}"] Invalid fetch-margin "${value}": ${originalMessage}` (or `render-margin`) and re-throw.

### `disconnectedCallback` (before existing `ad-unit:disconnected`)

1. Call `disconnect()` on both observers.
2. Null both fields.

Observers are kept alive after both events fire (not eagerly cleaned up). They will be reused for future viewability tracking.

### Reconnect behavior

When an element is removed and re-appended to the DOM, `connectedCallback` runs again: guards reset, new observers are created, events can fire again. This behavior may be revisited as real adapter patterns emerge.

## Margin Validation

### Fetch < render (same unit)

If `fetch-margin` resolves to a smaller value than `render-margin` and both use the same unit, this is a misconfiguration. The component will:
1. `console.warn` with context: `[ad-unit "${this.code}"] fetch-margin (${fetchMargin}) is less than render-margin (${renderMargin}), clamping fetch-margin to render-margin`
2. Clamp fetch margin to equal render margin for observer creation.

If the two margins use different units (e.g., one `px` and one `%`), the check is skipped.

### Invalid rootMargin

If the `IntersectionObserver` constructor throws due to an invalid margin value, the error is caught, wrapped with element context, and re-thrown:

```
[ad-unit "header-ad"] Invalid fetch-margin "banana": Failed to construct 'IntersectionObserver': ...
```

The original stack trace is preserved.

## Property Reflection

New getters/setters following the existing pattern:

```ts
get loading(): string {
  return this.getAttribute("loading") ?? "eager";
}

get fetchMargin(): string {
  return this.getAttribute("fetch-margin") ?? DEFAULT_FETCH_MARGIN;
}

get renderMargin(): string {
  return this.getAttribute("render-margin") ?? DEFAULT_RENDER_MARGIN;
}
```

Each has a corresponding setter that calls `setAttribute`.

## Testing Strategy

### IntersectionObserver mock

happy-dom's `IntersectionObserver` is a stub (no-op observe/disconnect). Tests replace `globalThis.IntersectionObserver` with a manual mock that:
- Captures `(callback, options)` on construction
- Tracks observed targets and `unobserve`/`disconnect` calls
- Exposes a `trigger(target, isIntersecting)` helper to invoke the callback with a minimal entry-shaped object

Replaced in `beforeEach`, restored in `afterEach`.

### Test cases

**Eager mode (default):**
1. `ad-unit:fetch` fires synchronously on connect when no `loading` attribute
2. `ad-unit:render` fires synchronously on connect when no `loading` attribute
3. Event order: `connected` before `fetch` before `render`
4. No `IntersectionObserver` created in eager mode

**Lazy mode:**
5. `ad-unit:fetch` fires when fetch observer triggers intersection
6. `ad-unit:render` fires when render observer triggers intersection
7. Default margins are `200%` (fetch) and `150%` (render)
8. Custom margins via `fetch-margin` / `render-margin` attributes
9. Each event fires at most once per connected lifecycle
10. Observers disconnected on element removal
11. Reconnect resets lifecycle (events can fire again)
12. Element already in view on connect (lazy): fetch fires before render, both fire

**Validation:**
12. Invalid margin throws with helpful `[ad-unit "code"]` context
13. Fetch margin < render margin (same unit) warns and clamps

**Event shape:**
14. Detail carries `{ code, sizes, gpid, pos, format, container }`
15. Events are `bubbles: true, composed: true, cancelable: true`

## Out of Scope

- **Chrome silent observer disconnection on CSS load**: The reference implementation (ad-project-v2 ViewabilityService) polled every 5s to detect elements silently dropped from observers. Custom element `disconnectedCallback` may handle this natively. Will validate in browser testing and address in a follow-up if needed.
- **`preventDefault()` / `proceed()` blocking** (issue #5): Events are `cancelable` to support this, but blocking behavior is not implemented here.
- **Viewability tracking**: Observers are kept alive after events fire to support future viewability features.
- **Visibility change pausing**: Modern browsers pause IntersectionObserver on hidden tabs. No manual pause/resume needed.

## Files Modified

- `src/ad-unit.ts` — add attributes, observer lifecycle, event dispatch
- `src/ad-unit.test.ts` — add test cases with IO mock

## Reference

- Previous implementation: `ad-project-v2/src/ViewabilityService/index.ts` (centralized service with observer pooling, percentage-based margins, 5s validation polling)
- Production margins in reference: `fetchMarginPercent: 200`, `renderMarginPercent: 150`
