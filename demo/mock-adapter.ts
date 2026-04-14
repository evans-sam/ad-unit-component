import type { BannerFormat } from "../src";

export interface MockAdapterOptions {
  auctionDelayMs?: number;
  bidPriceRange?: [number, number];
}

export interface MockAdapter {
  start(): void;

  stop(): void;
}

interface LifecycleDetail {
  code: string;
  container: HTMLElement;
  format: BannerFormat[] | null;
  gpid: string | null;
  pos: number | null;
  sizes: number[][];
}

export function createMockAdapter(
  options: MockAdapterOptions = {},
): MockAdapter {
  const auctionDelayMs = options.auctionDelayMs ?? 500;
  const [minPrice, maxPrice] = options.bidPriceRange ?? [0.1, 5.0];
  const pendingAuctions = new Map<string, ReturnType<typeof setTimeout>>();
  let started = false;

  const onConnected = (event: Event) => {
    const { code, sizes, format, container } = (
      event as CustomEvent<LifecycleDetail>
    ).detail;
    const [w, h] = pickSize(sizes, format);
    paintPending(container, code, w, h);
    const timer = setTimeout(() => {
      const price = randomPrice(minPrice, maxPrice);
      paintRendered(container, code, w, h, price);
      pendingAuctions.delete(code);
    }, auctionDelayMs);
    pendingAuctions.set(code, timer);
  };

  const onDisconnected = (event: Event) => {
    const { code } = (event as CustomEvent<LifecycleDetail>).detail;
    const timer = pendingAuctions.get(code);
    if (timer !== undefined) {
      clearTimeout(timer);
      pendingAuctions.delete(code);
    }
  };

  // Placeholder hooks for future lifecycle events (see plans/demo-test-harness.md):
  //   ad-unit:fetch   → #4 IntersectionObserver fetch zone
  //   ad-unit:render  → #4 IntersectionObserver render zone
  //   ad-unit:refresh → #6 refresh() method
  // When those land, attach handlers here and call event.waitUntil(bidPromise) to gate render.

  return {
    start() {
      if (started) return;
      document.addEventListener("ad-unit:connected", onConnected);
      document.addEventListener("ad-unit:disconnected", onDisconnected);
      started = true;
    },
    stop() {
      if (!started) return;
      document.removeEventListener("ad-unit:connected", onConnected);
      document.removeEventListener("ad-unit:disconnected", onDisconnected);
      for (const timer of pendingAuctions.values()) clearTimeout(timer);
      pendingAuctions.clear();
      started = false;
    },
  };
}

function pickSize(
  sizes: number[][],
  format: BannerFormat[] | null,
): [number, number] {
  if (sizes.length > 0) return [sizes[0][0], sizes[0][1]];
  if (format && format.length > 0) return [format[0].w, format[0].h];
  return [300, 250];
}

function randomPrice(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function paintPending(
  container: HTMLElement,
  code: string,
  w: number,
  h: number,
): void {
  container.innerHTML = "";
  const el = document.createElement("div");
  el.className = "mock-ad mock-ad--pending";
  el.dataset.state = "pending";
  el.dataset.code = code;
  el.dataset.width = String(w);
  el.dataset.height = String(h);
  el.style.cssText = paintStyle(w, h, "#2d3748", "#a0aec0");
  el.textContent = `${code} · ${w}×${h} · auctioning…`;
  container.appendChild(el);
}

function paintRendered(
  container: HTMLElement,
  code: string,
  w: number,
  h: number,
  price: number,
): void {
  container.innerHTML = "";
  const el = document.createElement("div");
  el.className = "mock-ad mock-ad--rendered";
  el.dataset.state = "rendered";
  el.dataset.code = code;
  el.dataset.width = String(w);
  el.dataset.height = String(h);
  el.dataset.price = price.toFixed(2);
  el.style.cssText = paintStyle(w, h, "#1a365d", "#bee3f8");
  el.textContent = `${code} · ${w}×${h} · $${price.toFixed(2)} CPM`;
  container.appendChild(el);
}

function paintStyle(w: number, h: number, bg: string, fg: string): string {
  return [
    `width:${w}px`,
    `height:${h}px`,
    `background:${bg}`,
    `color:${fg}`,
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font:500 0.8125rem system-ui,sans-serif",
    "border-radius:4px",
    "box-sizing:border-box",
  ].join(";");
}
