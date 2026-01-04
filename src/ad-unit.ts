import { AdBid } from "./ad-bid";
import type { BannerFormat, Bid, MediaTypes, PrebidAdUnit } from "./types";
import { parseSizes, serializeSizes } from "./utils/parse-sizes";

/**
 * AdUnit web component - self-registering Prebid banner ad unit
 *
 * This component handles ONLY banner ads. For video/native ads,
 * use extending implementations.
 *
 * @example
 * ```html
 * <!-- Basic banner with sizes -->
 * <ad-unit code="header-ad" sizes="728x90,970x250" pos="1" gpid="/1234/homepage/header">
 *   <ad-bid bidder="appnexus" params='{"placementId": 13144370}'></ad-bid>
 *   <ad-bid bidder="pubmatic" params='{"publisherId": "156276", "adSlot": "div-1"}'></ad-bid>
 * </ad-unit>
 *
 * <!-- Using ORTB format instead of sizes -->
 * <ad-unit code="flex-ad" format='[{"w":300,"h":250},{"w":320,"h":50}]' pos="3">
 *   <ad-bid bidder="appnexus" params='{"placementId": 789}'></ad-bid>
 * </ad-unit>
 *
 * <!-- With bids attribute (inline JSON) -->
 * <ad-unit
 *   code="sidebar-ad"
 *   sizes="300x250"
 *   pos="6"
 *   name="sidebar-debug"
 *   bids='[{"bidder":"appnexus","params":{"placementId":789}}]'>
 * </ad-unit>
 * ```
 *
 * @attr code - Unique identifier for this ad unit
 * @attr sizes - Banner sizes as "WxH,WxH" or JSON array format
 * @attr format - ORTB format objects as alternative to sizes (takes precedence)
 * @attr pos - OpenRTB position (0=unknown, 1=ATF, 3=BTF, 4=header, 5=footer, 6=sidebar, 7=fullscreen)
 * @attr name - Banner name for debugging
 * @attr gpid - Global Placement ID for first-party data
 * @attr bids - JSON array of bid configurations
 */
export class AdUnit extends HTMLElement {
  static observedAttributes = [
    "code",
    "sizes",
    "format",
    "gpid",
    "pos",
    "name",
    "bids",
  ];

  #registered = false;

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
    this.#registerWithPrebid();
  }

  disconnectedCallback() {
    this.#unregisterFromPrebid();
  }

  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
  ) {
    if (oldValue === newValue) return;

    // Re-render on attribute changes
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

  // --- Bid collection ---

  /**
   * Build the Prebid adUnit configuration object
   */
  toAdUnit(): PrebidAdUnit {
    const config: PrebidAdUnit = {
      code: this.code,
      mediaTypes: this.#buildMediaTypes(),
    };

    // Add bids if any
    const bids = this.#collectBids();
    if (bids.length > 0) {
      config.bids = bids;
    }

    // Add first-party data if gpid is set
    if (this.gpid) {
      config.ortb2Imp = {
        ext: {
          gpid: this.gpid,
        },
      };
    }

    return config;
  }

  // --- Prebid Integration ---

  /**
   * Collect bids from both attribute and child elements
   */
  #collectBids(): Bid[] {
    const bids: Bid[] = [];

    // From bids attribute (JSON)
    const bidsAttr = this.getAttribute("bids");
    if (bidsAttr) {
      try {
        const parsed = JSON.parse(bidsAttr);
        if (Array.isArray(parsed)) {
          bids.push(...parsed);
        }
      } catch (e) {
        console.warn(`[ad-unit] Invalid bids JSON for "${this.code}":`, e);
      }
    }

    // From child <ad-bid> elements
    const bidElements = this.querySelectorAll("ad-bid");
    for (const el of Array.from(bidElements)) {
      if (el instanceof AdBid) {
        bids.push(el.toBid());
      }
    }

    return bids;
  }

  /**
   * Build mediaTypes object from attributes
   * Per Prebid spec: either sizes or format must be provided for banner
   */
  #buildMediaTypes(): MediaTypes {
    const mediaTypes: MediaTypes = {};

    const sizes = this.sizes;
    const format = this.format;

    // Banner requires either sizes or format
    if (sizes.length > 0 || format) {
      mediaTypes.banner = {};

      // format takes precedence over sizes per Prebid docs
      if (format && format.length > 0) {
        mediaTypes.banner.format = format;
      } else if (sizes.length > 0) {
        mediaTypes.banner.sizes = sizes;
      }

      // Add optional banner properties
      const pos = this.pos;
      if (pos !== null) {
        mediaTypes.banner.pos = pos;
      }

      const name = this.name;
      if (name) {
        mediaTypes.banner.name = name;
      }
    }

    return mediaTypes;
  }

  /**
   * Register this ad unit with Prebid.js
   */
  #registerWithPrebid() {
    if (this.#registered) return;
    if (!this.code) {
      console.warn("[ad-unit] Cannot register: missing code attribute");
      return;
    }

    const config = this.toAdUnit();

    // Use Prebid's command queue pattern
    if (!window.pbjs) {
      window.pbjs = {
        que: [],
        addAdUnits: () => {},
        removeAdUnit: () => {},
      };
    }
    window.pbjs.que = window.pbjs.que || [];
    window.pbjs.que.push(() => {
      window.pbjs?.addAdUnits?.(config);
      console.debug(`[ad-unit] Registered "${this.code}" with Prebid`);
    });

    this.#registered = true;
  }

  /**
   * Remove this ad unit from Prebid.js
   */
  #unregisterFromPrebid() {
    if (!this.#registered || !this.code) return;

    window.pbjs?.que.push(() => {
      window.pbjs?.removeAdUnit?.(this.code);
      console.debug(`[ad-unit] Unregistered "${this.code}" from Prebid`);
    });

    this.#registered = false;
  }
}

customElements.define("ad-unit", AdUnit);
