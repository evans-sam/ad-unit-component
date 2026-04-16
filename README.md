# ad-unit-component

A vendor-agnostic `<ad-unit>` web component. Declare ad slots in HTML; external adapters (Prebid, GAM, etc.) handle vendor-specific behavior by listening to lifecycle events.

## Install

```bash
npm install @ad-unit/core
```

## Usage

```html
<script type="module">
  import "@ad-unit/core";
</script>

<ad-unit
  code="header-ad"
  sizes="728x90,970x250"
  pos="1"
  gpid="/1234/homepage/header"
></ad-unit>
```

### Attributes

| Attribute       | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `code`          | Unique identifier for this ad unit                                          |
| `sizes`         | Banner sizes as `"WxH,WxH"` or JSON array                                   |
| `format`        | ORTB format objects as JSON (`[{"w":300,"h":250}]`); takes precedence over `sizes` |
| `pos`           | OpenRTB position (0=unknown, 1=ATF, 3=BTF, 4=header, 5=footer, 6=sidebar, 7=fullscreen) |
| `name`          | Banner name for debugging                                                   |
| `gpid`          | Global Placement ID for first-party data                                    |
| `loading`       | `"eager"` (default) or `"lazy"` for viewport-based dispatch                 |
| `fetch-margin`  | `rootMargin` for the fetch zone observer (default `"200%"`)                 |
| `render-margin` | `rootMargin` for the render zone observer (default `"150%"`)                |

## Lifecycle

Every connected `<ad-unit>` dispatches three lifecycle events in order:

```
ad-unit:connected → ad-unit:fetch → ad-unit:render
```

Each event is an `AdUnitLifecycleEvent`. Listeners can hold progression to the next stage by calling `event.waitUntil(promise)`. Multiple listeners compose — all pending promises are awaited via `Promise.all` before the next event fires.

```ts
import type { AdUnitLifecycleEvent } from "@ad-unit/core";

adUnit.addEventListener("ad-unit:fetch", (e) => {
  const event = e as AdUnitLifecycleEvent;
  event.waitUntil(runAuction(event.detail)); // render is held until bids settle
});
```

When no listener calls `waitUntil`, events fire synchronously in the same call stack — no microtask overhead.

### Lazy loading

With `loading="lazy"`, the component attaches internal `waitUntil` gates to `ad-unit:connected` and `ad-unit:fetch`. These compose with user-supplied `waitUntil` promises: `ad-unit:render` fires only after the element enters the render zone **and** all user promises have settled.

### Observable state

- `adUnit.blocked` — `true` while any stage is awaiting a `waitUntil` promise
- `ad-unit:stage-blocked` / `ad-unit:stage-unblocked` — transition events (`detail: { stage }`)
- `ad-unit:error` — fires if any `waitUntil` promise rejects; halts the lifecycle (`detail: { stage, error }`)

### Refresh

Call `adUnit.refresh()` to trigger a new lifecycle cycle:

```
ad-unit:refresh → ad-unit:fetch → ad-unit:render
```

Refresh reuses the same `waitUntil` stage machinery as the initial connect, but bypasses lazy-loading viewport gates — it is an explicit trigger.

```ts
const adUnit = document.querySelector("ad-unit") as AdUnit;
adUnit.refresh();
```

`adUnit.refreshCount` (readonly) increments before each `ad-unit:refresh` dispatch. The value is carried on every event's `detail.refreshCount`, so adapters can distinguish first-load (`0`) from the N-th refresh. If `refresh()` is called while a cycle is already in flight, the old cycle is aborted and a new one starts. Calling `refresh()` on a disconnected element is a no-op with a console warning.

Scheduling, viewability-gated refresh, max-count caps, and auction batching are adapter concerns — the component exposes only the trigger primitive.

## Development

```bash
bun install          # install dependencies
bun run dev          # dev server with hot reload
bun test             # run tests
bun run test:coverage # run tests with coverage
bun run build        # build JS bundle + type declarations
bun run lint         # check with Biome
bun run lint:fix     # auto-fix lint issues
bun run lint:compat  # browser-compat check vs .browserslistrc
```

The supported browser floor is declared in `.browserslistrc` (`baseline widely available`). `bun run lint:compat` runs [oxlint](https://oxc.rs/docs/guide/usage/linter) with [`eslint-plugin-compat`](https://github.com/amilajack/eslint-plugin-compat) loaded as a JS plugin to flag DOM/JS APIs outside that floor. Biome (`bun run lint`) remains the primary linter for style and correctness.
