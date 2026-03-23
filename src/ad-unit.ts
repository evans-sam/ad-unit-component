import type { BannerFormat } from "./types";
import { parseSizes, serializeSizes } from "./utils/parse-sizes";

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
 */
export class AdUnit extends HTMLElement {
  static observedAttributes = [
    "code",
    "sizes",
    "format",
    "gpid",
    "pos",
    "name",
  ];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
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
    return Number.isNaN(parsed) ? null : parsed;
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
    if (value) {
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
        return parsed.filter(
          (f): f is BannerFormat =>
            typeof f === "object" &&
            f !== null &&
            typeof f.w === "number" &&
            typeof f.h === "number",
        );
      }
    } catch {
      console.warn(`[ad-unit] Invalid format JSON for "${this.code}"`);
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

  // --- Lifecycle ---

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {}

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
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
      </style>
      <slot></slot>
    `;
  }
}

customElements.define("ad-unit", AdUnit);
