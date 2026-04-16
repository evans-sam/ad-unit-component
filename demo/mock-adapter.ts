import type {
  AdUnitLifecycleEvent,
  BannerFormat,
  HeaderBiddingAdapter,
} from "../src";

export interface MockAdapterOptions {
  auctionDelayMs?: number;
  bidPriceRange?: [number, number];
}

interface LifecycleDetail {
  code: string;
  container: HTMLElement;
  format: BannerFormat[] | null;
  gpid: string | null;
  pos: number | null;
  sizes: number[][];
  refreshCount?: number;
}

interface PendingAuction {
  timer: ReturnType<typeof setTimeout>;
  price: number;
  reject: (reason: unknown) => void;
}

/**
 * Simulates a bidder + creative-render pipeline using the `<ad-unit>` public
 * event surface. Listens for `ad-unit:fetch`, paints a pending placard, and
 * calls `event.waitUntil(auctionPromise)` so the component holds off dispatching
 * `ad-unit:render` until the fake auction resolves. On `ad-unit:render`, paints
 * the rendered placard with a random bid price. Handles refresh cycles for free
 * — `refresh()` re-fires `fetch` → `render`, so the same handlers apply.
 */
export function createMockAdapter(
  options: MockAdapterOptions = {},
): HeaderBiddingAdapter {
  const auctionDelayMs = options.auctionDelayMs ?? 500;
  const [minPrice, maxPrice] = options.bidPriceRange ?? [0.1, 5.0];
  const pendingAuctions = new Map<string, PendingAuction>();
  let started = false;

  const onFetch = (event: Event) => {
    const lifecycleEvent = event as AdUnitLifecycleEvent;
    const { code, sizes, format, container, refreshCount } = (
      event as CustomEvent<LifecycleDetail>
    ).detail;
    const [w, h] = pickSize(sizes, format);
    paintPending(container, code, w, h, refreshCount ?? 0);

    // Cancel any in-flight auction for this code (e.g. a refresh preempting
    // an ongoing cycle). The orphan promise rejects with AbortError, which
    // ad-unit's #awaitStage filters out of ad-unit:error.
    cancelAuction(code, pendingAuctions);

    const price = minPrice + Math.random() * (maxPrice - minPrice);
    const auction = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, auctionDelayMs);
      pendingAuctions.set(code, { timer, price, reject });
    });

    lifecycleEvent.waitUntil(auction);
  };

  const onRender = (event: Event) => {
    const { code, sizes, format, container, refreshCount } = (
      event as CustomEvent<LifecycleDetail>
    ).detail;
    const [w, h] = pickSize(sizes, format);
    const entry = pendingAuctions.get(code);
    pendingAuctions.delete(code);
    const price =
      entry?.price ?? minPrice + Math.random() * (maxPrice - minPrice);
    paintRendered(container, code, w, h, price, refreshCount ?? 0);
  };

  const onDisconnected = (event: Event) => {
    const { code } = (event as CustomEvent<LifecycleDetail>).detail;
    cancelAuction(code, pendingAuctions);
  };

  return {
    name: "mock",
    init() {
      if (started) return;
      document.addEventListener("ad-unit:fetch", onFetch);
      document.addEventListener("ad-unit:render", onRender);
      document.addEventListener("ad-unit:disconnected", onDisconnected);
      started = true;
    },
    destroy() {
      if (!started) return;
      document.removeEventListener("ad-unit:fetch", onFetch);
      document.removeEventListener("ad-unit:render", onRender);
      document.removeEventListener("ad-unit:disconnected", onDisconnected);
      for (const entry of pendingAuctions.values()) {
        clearTimeout(entry.timer);
      }
      pendingAuctions.clear();
      started = false;
    },
  };
}

function cancelAuction(
  code: string,
  pending: Map<string, PendingAuction>,
): void {
  const entry = pending.get(code);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.reject(new DOMException("auction canceled", "AbortError"));
  pending.delete(code);
}

function pickSize(
  sizes: number[][],
  format: BannerFormat[] | null,
): [number, number] {
  if (sizes.length > 0) return [sizes[0][0], sizes[0][1]];
  if (format && format.length > 0) return [format[0].w, format[0].h];
  return [300, 250];
}

function paintPending(
  container: HTMLElement,
  code: string,
  w: number,
  h: number,
  refreshCount: number,
): void {
  container.innerHTML = "";
  const el = document.createElement("div");
  el.className = "mock-ad mock-ad--pending";
  el.dataset.state = "pending";
  el.dataset.code = code;
  el.dataset.width = String(w);
  el.dataset.height = String(h);
  el.dataset.refreshCount = String(refreshCount);
  el.style.cssText = paintStyle(w, h, "#2d3748", "#a0aec0");
  const suffix = refreshCount > 0 ? ` · refresh #${refreshCount}` : "";
  el.textContent = `${code} · ${w}×${h} · auctioning…${suffix}`;
  container.appendChild(el);
}

function paintRendered(
  container: HTMLElement,
  code: string,
  w: number,
  h: number,
  price: number,
  refreshCount: number,
): void {
  container.innerHTML = "";
  const el = document.createElement("div");
  el.className = "mock-ad mock-ad--rendered";
  el.dataset.state = "rendered";
  el.dataset.code = code;
  el.dataset.width = String(w);
  el.dataset.height = String(h);
  el.dataset.price = price.toFixed(2);
  el.dataset.refreshCount = String(refreshCount);
  el.style.cssText = paintStyle(w, h, "#1a365d", "#bee3f8");
  const suffix = refreshCount > 0 ? ` · refresh #${refreshCount}` : "";
  el.textContent = `${code} · ${w}×${h} · $${price.toFixed(2)} CPM${suffix}`;
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
