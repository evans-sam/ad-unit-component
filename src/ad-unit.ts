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

/**
 * AdUnit web component - declarative ad unit lifecycle manager
 *
 * This component is vendor-agnostic. It manages shadow DOM, attribute
 * reflection, and content projection. Vendor-specific behavior (Prebid,
 * GAM, etc.) is handled by adapters that listen to ad-unit events.
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
  #fetchObserver: IntersectionObserver | null = null;
  #renderObserver: IntersectionObserver | null = null;
  #fetchFired = false;
  #renderFired = false;

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

  // --- Lifecycle ---

  connectedCallback() {
    this.render();
    this.#dispatchLifecycle("ad-unit:connected");

    if (this.loading === "lazy") {
      this.#setupObservers();
    } else {
      this.#dispatchLifecycle("ad-unit:fetch");
      this.#dispatchLifecycle("ad-unit:render");
    }
  }

  disconnectedCallback() {
    this.#teardownObservers();
    this.#dispatchLifecycle("ad-unit:disconnected");
  }

  #setupObservers() {
    this.#fetchFired = false;
    this.#renderFired = false;

    let fetchMargin = this.fetchMargin;
    const renderMargin = this.renderMargin;

    const fetchParsed = parseMargin(fetchMargin, "fetch-margin", this.code);
    const renderParsed = parseMargin(renderMargin, "render-margin", this.code);
    if (
      fetchParsed.unit === renderParsed.unit &&
      fetchParsed.value < renderParsed.value
    ) {
      console.warn(
        `[ad-unit "${this.code}"] fetch-margin (${fetchMargin}) is less than render-margin (${renderMargin}), clamping fetch-margin to render-margin`,
      );
      fetchMargin = renderMargin;
    }

    this.#fetchObserver = this.#createObserver(
      fetchMargin,
      "fetch-margin",
      () => {
        if (this.#fetchFired) return;
        this.#fetchFired = true;
        this.#fetchObserver?.unobserve(this);
        this.#dispatchLifecycle("ad-unit:fetch");
      },
    );

    this.#renderObserver = this.#createObserver(
      renderMargin,
      "render-margin",
      () => {
        if (this.#renderFired) return;
        if (!this.#fetchFired) {
          this.#fetchFired = true;
          this.#fetchObserver?.unobserve(this);
          this.#dispatchLifecycle("ad-unit:fetch");
        }
        this.#renderFired = true;
        this.#renderObserver?.unobserve(this);
        this.#dispatchLifecycle("ad-unit:render");
      },
    );

    this.#fetchObserver.observe(this);
    this.#renderObserver.observe(this);
  }

  #createObserver(
    margin: string,
    attrName: string,
    onIntersect: () => void,
  ): IntersectionObserver {
    try {
      return new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              onIntersect();
              return;
            }
          }
        },
        { rootMargin: margin },
      );
    } catch (e) {
      throw new Error(
        `[ad-unit "${this.code}"] Invalid ${attrName} "${margin}": ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  #teardownObservers() {
    this.#fetchObserver?.disconnect();
    this.#renderObserver?.disconnect();
    this.#fetchObserver = null;
    this.#renderObserver = null;
  }

  #dispatchLifecycle(type: string) {
    this.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: {
          code: this.code,
          sizes: this.sizes,
          gpid: this.gpid,
          pos: this.pos,
          format: this.format,
          container: this.container,
        },
      }),
    );
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
