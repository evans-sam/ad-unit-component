import type { BannerFormat } from "./types";
import { parseSizes, serializeSizes } from "./utils/parse-sizes";

const DEFAULT_FETCH_MARGIN = "200%";
const DEFAULT_RENDER_MARGIN = "150%";

interface ParsedMargin {
  value: number;
  unit: "px" | "%";
}

function parseMargin(
  margin: string,
  label: string,
  code: string,
): ParsedMargin {
  const match = margin.match(/^(-?\d+(?:\.\d+)?)(px|%)$/);
  if (!match?.[1] || !match[2]) {
    console.warn(
      `[ad-unit "${code}"] Could not parse ${label} "${margin}" for comparison, expected a number followed by px or %. Falling back to default.`,
    );
    return label === "fetch-margin"
      ? { value: 200, unit: "%" }
      : { value: 150, unit: "%" };
  }
  return { value: Number.parseFloat(match[1]), unit: match[2] as "px" | "%" };
}

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
export class AdUnit extends HTMLElement {
  static observedAttributes = [
    "code",
    "sizes",
    "format",
    "gpid",
    "pos",
    "name",
    "loading",
    "fetch-margin",
    "render-margin",
  ];

  #container: HTMLDivElement;
  #aborted = false;
  #cycleId = 0;
  #blockedStages = new Set<string>();
  #zoneController: AbortController | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ":host { display: block; }";
    this.#container = document.createElement("div");
    this.#container.setAttribute("part", "container");
    this.#container.appendChild(document.createElement("slot"));
    root.append(style, this.#container);
  }

  /**
   * Managed container div inside the shadow DOM. Adapters render ads here.
   */
  get container(): HTMLDivElement {
    return this.#container;
  }

  // --- Attribute/Property reflection ---

  /**
   * Unique identifier for this ad unit
   * Falls back to element id if not specified
   */
  get code(): string {
    return this.getAttribute("code") ?? this.id ?? "";
  }

  set code(value: string) {
    this.setAttribute("code", value);
  }

  /**
   * Banner sizes as 2D array
   */
  get sizes(): number[][] {
    return parseSizes(this.getAttribute("sizes"));
  }

  set sizes(value: number[][] | string) {
    if (typeof value === "string") {
      this.setAttribute("sizes", value);
    } else {
      this.setAttribute("sizes", serializeSizes(value));
    }
  }

  /**
   * Global Placement ID for first-party data
   */
  get gpid(): string | null {
    return this.getAttribute("gpid");
  }

  set gpid(value: string | null) {
    if (value) {
      this.setAttribute("gpid", value);
    } else {
      this.removeAttribute("gpid");
    }
  }

  /**
   * OpenRTB page position value
   * 0=unknown, 1=above-the-fold, 3=below-the-fold, 4=header, 5=footer, 6=sidebar, 7=fullscreen
   */
  get pos(): number | null {
    const value = this.getAttribute("pos");
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      console.warn(`[ad-unit] pos: invalid value "${value}", expected integer`);
      return null;
    }
    return parsed;
  }

  set pos(value: number | null) {
    if (value !== null) {
      this.setAttribute("pos", String(value));
    } else {
      this.removeAttribute("pos");
    }
  }

  /**
   * Banner name for debugging/testing
   */
  get name(): string | null {
    return this.getAttribute("name");
  }

  set name(value: string | null) {
    if (value !== null) {
      this.setAttribute("name", value);
    } else {
      this.removeAttribute("name");
    }
  }

  /**
   * ORTB format objects as alternative to sizes
   * Format: '[{"w":300,"h":250},{"w":728,"h":90}]'
   */
  get format(): BannerFormat[] | null {
    const value = this.getAttribute("format");
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          (f): f is BannerFormat =>
            typeof f === "object" &&
            f !== null &&
            typeof f.w === "number" &&
            typeof f.h === "number",
        );
        return filtered.length > 0 ? filtered : null;
      }
    } catch (e) {
      console.warn(
        `[ad-unit] Invalid format JSON for "${this.code}": ${JSON.stringify(this.getAttribute("format"))}`,
        e,
      );
    }
    return null;
  }

  set format(value: BannerFormat[] | string | null) {
    if (value === null) {
      this.removeAttribute("format");
    } else if (typeof value === "string") {
      this.setAttribute("format", value);
    } else {
      this.setAttribute("format", JSON.stringify(value));
    }
  }

  get loading(): string {
    return this.getAttribute("loading") ?? "eager";
  }

  set loading(value: string) {
    this.setAttribute("loading", value);
  }

  get fetchMargin(): string {
    return this.getAttribute("fetch-margin") ?? DEFAULT_FETCH_MARGIN;
  }

  set fetchMargin(value: string) {
    this.setAttribute("fetch-margin", value);
  }

  get renderMargin(): string {
    return this.getAttribute("render-margin") ?? DEFAULT_RENDER_MARGIN;
  }

  set renderMargin(value: string) {
    this.setAttribute("render-margin", value);
  }

  /**
   * True while any lifecycle stage is awaiting a waitUntil promise.
   */
  get blocked(): boolean {
    return this.#blockedStages.size > 0;
  }

  // --- Lifecycle ---

  connectedCallback() {
    this.render();
    this.#aborted = false;
    this.#cycleId++;
    this.#blockedStages.clear();
    this.#zoneController = new AbortController();
    this.#runConnectedStage();
  }

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

  #stageName(eventType: string): string {
    return eventType.replace(/^ad-unit:/, "");
  }

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

  disconnectedCallback() {
    this.#aborted = true;
    this.#zoneController?.abort();
    this.#zoneController = null;
    const disconnectedEvent = this.#dispatchLifecycle("ad-unit:disconnected");
    disconnectedEvent.endDispatch();
  }

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
      // Only warn once — when resolving the fetch zone.
      if (zone === "fetch") {
        console.warn(
          `[ad-unit "${this.code}"] fetch-margin (${fetchMargin}) is less than render-margin (${renderMargin}), clamping fetch-margin to render-margin`,
        );
      }
      effectiveFetch = renderMargin;
    }

    return zone === "fetch" ? effectiveFetch : renderMargin;
  }

  #awaitZone(zone: "fetch" | "render"): Promise<void> {
    const signal = this.#zoneController?.signal;
    if (!signal) {
      return Promise.reject(
        new DOMException("ad-unit disconnected", "AbortError"),
      );
    }

    const rawMargin = zone === "fetch" ? this.fetchMargin : this.renderMargin;
    const attributeName = zone === "fetch" ? "fetch-margin" : "render-margin";
    const effectiveMargin = this.#resolveMargin(zone);

    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
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

      signal.addEventListener(
        "abort",
        () => {
          observer.disconnect();
          reject(new DOMException("ad-unit disconnected", "AbortError"));
        },
        { once: true },
      );
    });
  }

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

  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
  ) {
    if (oldValue === newValue) return;

    if (this.isConnected) {
      this.render();
    }
  }

  // --- Rendering ---

  render() {
    // Shadow DOM structure is stable (built in constructor). Extension point
    // for subclasses / future behavior that reacts to attribute changes.
  }
}

customElements.define("ad-unit", AdUnit);
