import type { Bid, BidParams } from "./types";

/**
 * AdBid component - declarative bid configuration for ad units
 *
 * @example
 * ```html
 * <ad-bid bidder="appnexus" placement-id="123456"></ad-bid>
 * <ad-bid bidder="rubicon" account-id="1001" site-id="2002" zone-id="3003"></ad-bid>
 * ```
 */
export class AdBid extends HTMLElement {
  static observedAttributes = ["bidder"];

  /**
   * Get the bidder name
   */
  get bidder(): string {
    return this.getAttribute("bidder") ?? "";
  }

  set bidder(value: string) {
    this.setAttribute("bidder", value);
  }

  /**
   * Convert all non-bidder attributes to a params object
   * Converts kebab-case attributes to camelCase params
   */
  #collectParams(): BidParams {
    const params: BidParams = {};

    for (const attr of Array.from(this.attributes)) {
      if (attr.name === "bidder") continue;

      // Convert kebab-case to camelCase
      const camelKey = attr.name.replace(
        /-([a-z])/g,
        (_: string, letter: string) => letter.toUpperCase(),
      );

      // Try to parse as JSON/number, otherwise keep as string
      let value: unknown = attr.value;
      try {
        value = JSON.parse(attr.value);
      } catch {
        // Check if it's a number
        const num = Number(attr.value);
        if (!Number.isNaN(num) && attr.value.trim() !== "") {
          value = num;
        }
      }

      params[camelKey] = value;
    }

    return params;
  }

  /**
   * Convert this element to a Prebid bid object
   */
  toBid(): Bid {
    return {
      bidder: this.bidder,
      params: this.#collectParams(),
    };
  }
}

customElements.define("ad-bid", AdBid);
