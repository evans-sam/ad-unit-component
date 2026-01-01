import { AdBid } from "./ad-bid";
import type { Bid, MediaTypes, PrebidAdUnit } from "./types";
import { parseSizes, serializeSizes } from "./utils/parse-sizes";

/**
 * AdUnit web component - self-registering Prebid ad unit
 *
 * @example
 * ```html
 * <!-- With child bid elements -->
 * <ad-unit code="header-ad" sizes="728x90,970x250">
 *   <ad-bid bidder="appnexus" placement-id="123456"></ad-bid>
 *   <ad-bid bidder="rubicon" account-id="1001" site-id="2002"></ad-bid>
 * </ad-unit>
 *
 * <!-- With bids attribute -->
 * <ad-unit
 *   code="sidebar-ad"
 *   sizes="300x250"
 *   bids='[{"bidder":"appnexus","params":{"placementId":789}}]'>
 * </ad-unit>
 * ```
 */
export class AdUnit extends HTMLElement {
  static observedAttributes = ["code", "sizes", "gpid", "pos", "bids"];

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
   * Ad position on page (0-7 per IAB spec)
   */
  get pos(): number | null {
    const attr = this.getAttribute("pos");
    return attr ? Number(attr) : null;
  }

  set pos(value: number | null) {
    if (value !== null) {
      this.setAttribute("pos", String(value));
    } else {
      this.removeAttribute("pos");
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

  // --- Prebid Integration ---

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

  /**
   * Build mediaTypes object from attributes
   */
  #buildMediaTypes(): MediaTypes {
    const mediaTypes: MediaTypes = {};

    const sizes = this.sizes;
    if (sizes.length > 0) {
      mediaTypes.banner = { sizes };

      if (this.pos !== null) {
        mediaTypes.banner.pos = this.pos;
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
      window.pbjs?.addAdUnits(config);
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
      window.pbjs?.removeAdUnit(this.code);
      console.debug(`[ad-unit] Unregistered "${this.code}" from Prebid`);
    });

    this.#registered = false;
  }
}

customElements.define("ad-unit", AdUnit);
