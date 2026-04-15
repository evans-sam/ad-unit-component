# AGENTS.md

Guidance for Claude Code, Codex, Gemini CLI, Copilot, and other coding agents working in this repo.

## Project

Vendor-agnostic ad unit web component library. `<ad-unit>` is a custom element that emits lifecycle events; vendor-specific behavior (Prebid, GAM, apstag) lives in external adapters that listen to those events.

## Runtime: Bun

Default to Bun over Node/npm/pnpm/vite.

- `bun <file>` instead of `node <file>` or `ts-node <file>`
- `bun test` instead of `jest` / `vitest`
- `bun build <file>` instead of webpack / esbuild
- `bun install` instead of `npm install` / `yarn install` / `pnpm install`
- `bun run <script>` instead of `npm run <script>`
- `bunx <package>` instead of `npx <package>`
- Bun auto-loads `.env` — do not add dotenv.

### Bun APIs when relevant

- `Bun.serve()` for HTTP/WS/HTTPS/routes. Do not add `express`.
- `bun:sqlite` for SQLite. No `better-sqlite3`.
- `Bun.redis` for Redis. No `ioredis`.
- `Bun.sql` for Postgres. No `pg` / `postgres.js`.
- `WebSocket` built-in. No `ws`.
- Prefer `Bun.file` over `node:fs` readFile/writeFile.
- `Bun.$\`ls\`` over `execa`.

This package itself is a library, not a server. Bun is still the toolchain (test, build, lint).

## Commands

```bash
bun install                   # install deps
bun run build                 # bundle + emit .d.ts to dist/
bun run dev                   # hot-reload dev server (demo harness)
bun test                      # run all tests
bun test --watch              # watch mode
bun test src/ad-unit.test.ts  # single file
bun run test:coverage         # coverage report
bun run lint                  # Biome check
bun run lint:fix              # Biome auto-fix
bun run lint:compat           # browser-compat check (oxlint + eslint-plugin-compat) vs .browserslistrc
```

## Architecture

### Component surface

`<ad-unit>` is the single custom element. Attributes reflect as typed properties:

- `code` — unique ad unit id
- `sizes` — banner sizes, `"WxH,WxH"` or JSON array
- `format` — OpenRTB format objects; takes precedence over `sizes`
- `pos` — OpenRTB page position (0/1/3/4/5/6/7)
- `name` — debug name
- `gpid` — Global Placement ID
- `loading` — `"eager"` (default) or `"lazy"`
- `fetch-margin` / `render-margin` — `rootMargin` for IntersectionObserver zones (lazy mode only)

Usage:

```html
<ad-unit code="header-ad" sizes="728x90,970x250" pos="1" gpid="/1234/homepage/header">
</ad-unit>
```

### Lifecycle + waitUntil

Stages dispatch in order: `ad-unit:connected` → `ad-unit:fetch` → `ad-unit:render`. Each is an `AdUnitLifecycleEvent` (subclass of `CustomEvent`). Listeners gate the next stage via `event.waitUntil(promise)` — the web-platform `ExtendableEvent` pattern. Multiple waiters compose via `Promise.all`.

No `preventDefault` / `proceed()` — events are `cancelable: false`. Async gating is exclusively through `waitUntil`.

Zero-waiter path stays fully synchronous (no microtask yield). Only once a listener registers `waitUntil` does execution yield.

Observable state:

- `adUnit.blocked` (readonly) — `true` while any stage is awaiting a pending promise
- `ad-unit:stage-blocked` / `ad-unit:stage-unblocked` — fire around blocked transitions with `detail.stage`
- `ad-unit:error` — fires when a `waitUntil` promise rejects; halts lifecycle. `detail: { stage, error }`

Event detail (all lifecycle events):

```ts
interface AdUnitLifecycleDetail {
  code?: string;
  sizes?: number[][];
  gpid?: string | null;
  pos?: number | null;
  format?: BannerFormat[] | null;
  container?: HTMLDivElement;
  refreshCount?: number;  // added in issue #6
}
```

### Lazy loading

`loading="lazy"` attaches built-in `waitUntil` promises that gate `ad-unit:fetch` on a fetch-zone `IntersectionObserver` and `ad-unit:render` on a render-zone observer. Zones compose with user `waitUntil` calls. Margin validation: if `fetch-margin < render-margin` in same unit, fetch margin clamps to render margin with a console.warn. Invalid margin values surface via `ad-unit:error`.

### Refresh

`refresh()` method triggers a new lifecycle cycle: `ad-unit:refresh` → `ad-unit:fetch` → `ad-unit:render`. Reuses the same `waitUntil` stage machinery. Refresh bypasses lazy viewport gates — explicit trigger. `adUnit.refreshCount` (readonly) increments per call, carried on all stage event details.

Scheduling, viewability-gated refresh, max-count caps, auction-level batching — all adapter concerns, not component concerns. The component exposes the primitive; a future refresh adapter owns policy.

See `docs/superpowers/specs/2026-04-14-refresh-method-design.md` and `docs/superpowers/plans/2026-04-14-refresh-method.md`.

### Vendor decoupling

No Prebid / GAM / apstag references in `src/ad-unit.ts` or the types. Adapters subscribe to lifecycle events externally and act on the component's public surface. Any edit that reaches into a vendor SDK from the core component is wrong.

## Key files

- `src/ad-unit.ts` — `AdUnit` class, `AdUnitLifecycleEvent`, all lifecycle + refresh logic
- `src/types.ts` — OpenRTB-aligned types (`BannerFormat`, `BannerPosition`, `BannerMediaType`, `MediaTypes`) used as adapter contracts
- `src/utils/parse-sizes.ts` — size string parser for `"300x250,728x90"` and JSON-array forms
- `src/index.ts` — public exports
- `build.ts` — Bun bundler config (ESM, minified, inline sourcemaps)
- `happydom.ts` — test-time DOM registrator
- `docs/superpowers/specs/` — design specs per issue
- `docs/superpowers/plans/` — implementation plans per issue

## Testing

`bun:test` + `@happy-dom/global-registrator` for DOM APIs. Tests live in `src/*.test.ts` alongside source.

Conventions:

- Mock `globalThis.IntersectionObserver` with `MockIntersectionObserver` in `beforeEach`; restore in `afterEach`. See `src/ad-unit.test.ts` top.
- `container = document.createElement("div"); document.body.appendChild(container);` per test; append the `<ad-unit>` to it, remove in `afterEach`.
- Lifecycle event detail: assert per-field (`expect(d.code).toBe(...)`) rather than whole-object `.toEqual` — detail shape may grow.
- For async `waitUntil` tests: after resolving a gate, `await gate; await Promise.resolve(); await Promise.resolve();` to drain the microtask queue.

Example:

```ts
import { test, expect } from "bun:test";
import { AdUnit, AdUnitLifecycleEvent } from "./ad-unit";

test("waitUntil on fetch defers render", async () => {
  const element = document.createElement("ad-unit") as AdUnit;
  let resolve: () => void;
  const gate = new Promise<void>((r) => { resolve = r; });

  let renderFired = false;
  element.addEventListener("ad-unit:fetch", (e) => {
    (e as AdUnitLifecycleEvent).waitUntil(gate);
  });
  element.addEventListener("ad-unit:render", () => { renderFired = true; });

  container.appendChild(element);
  expect(renderFired).toBe(false);

  resolve!();
  await gate;
  await Promise.resolve();
  await Promise.resolve();

  expect(renderFired).toBe(true);
});
```

## Code style

- Biome for lint + format (double quotes, 2-space indent).
- Lefthook pre-commit hook runs Biome on staged files.
- Prefer full-word names (`fetchEvent`, not `fetchEvt`).
- No emojis in files unless the user explicitly asks.
- Private fields use `#` (native), not TypeScript `private`.
- Comments: the WHY only, and only when non-obvious. Never describe WHAT — names already do that.

## Workflow

Feature work follows `superpowers` plugin flow:

1. `/superpowers:brainstorming` — interview + design doc → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
2. `/superpowers:writing-plans` — turns spec into a task-by-task plan → `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
3. `/superpowers:subagent-driven-development` or `/superpowers:executing-plans` — execute the plan

Branch naming: `<issue-number>-<kebab-description>` (e.g. `6-add-refresh-method-and-ad-unit-refresh-event`).

Commits are small + conventional (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Each task in a plan is one commit.

## Issues + history

Closed (merged) work that shapes current architecture:

- **#2** — strip Prebid coupling from the `<ad-unit>` element
- **#3** — rewrite as pure lifecycle component with DOM events
- **#4** — `IntersectionObserver` lazy loading with `fetch-margin` / `render-margin`
- **#5** — replace cancelable-event + `proceed()` with `event.waitUntil(promise)`
- **#6** — `refresh()` method + `ad-unit:refresh` event with `refreshCount` property

Open work that matters for current edits:

- **#7** — adapter registries + TypeScript interfaces
- **#10/#11/#12** — GAM, Prebid, apstag adapters (external to the component)
