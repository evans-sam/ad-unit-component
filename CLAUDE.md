# CLAUDE.md


---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun install         # Install dependencies
bun run build       # Build JS bundle + TypeScript declarations
bun run dev         # Run dev server with hot reload
bun test            # Run all tests
bun test --watch    # Run tests in watch mode
bun test src/ad-unit.test.ts  # Run a single test file
bun run lint        # Check code with Biome
bun run lint:fix    # Auto-fix lint issues
```

## Architecture

This is a vendor-agnostic ad unit web component library. The `<ad-unit>` custom element manages ad slot configuration declaratively via HTML attributes. Vendor-specific behavior (Prebid, GAM, etc.) is handled by external adapters that interact with the component's public property/attribute API.

### Core Components

- **`<ad-unit>`** (`src/ad-unit.ts`) - Main component that manages ad unit configuration. Uses Shadow DOM with a slot for content projection. Reflects attributes (`code`, `sizes`, `format`, `pos`, `name`, `gpid`) as typed properties. Vendor-agnostic — adapters read properties and subscribe to attribute changes externally.

### Usage Pattern

```html
<ad-unit code="header-ad" sizes="728x90,970x250" pos="1" gpid="/1234/homepage/header">
</ad-unit>
```

### Key Files

- `src/types.ts` - OpenRTB-aligned TypeScript types (`BannerFormat`, `BannerPosition`, `BannerMediaType`, `MediaTypes`) used as adapter contracts
- `src/utils/parse-sizes.ts` - Size string parser supporting `"300x250,728x90"` and JSON array formats
- `build.ts` - Bun bundler configuration (ESM, minified, inline sourcemaps)

### Testing

Tests use `bun:test` with `@happy-dom/global-registrator` for DOM APIs. Tests verify property reflection, attribute parsing, lifecycle behavior, and vendor decoupling (ensuring no Prebid references remain).

## Code Style

- Biome for linting and formatting (double quotes, space indentation)
- Lefthook pre-commit hook runs Biome on staged files
