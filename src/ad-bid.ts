import type { Bid, BidParams } from "./types";

/**
 * AdBid component - declarative bid configuration for ad units
 *
 * Uses JSON for params to preserve exact types (strings vs numbers)
 * and support any param key names without HTML attribute restrictions.
 *
 * @example
 * ```html
 * <ad-bid bidder="appnexus" params='{"placementId": 13144370}'></ad-bid>
 * <ad-bid bidder="pubmatic" params='{"publisherId": "156276", "adSlot": "div-1"}'></ad-bid>
 * <ad-bid bidder="rubicon" params='{"accountId": 1001, "siteId": 2002, "zoneId": 3003}'></ad-bid>
 * ```
 */
export class AdBid extends HTMLElement {
  static observedAttributes = ["bidder", "params"];

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
   * Get params as object
   */
  get params(): BidParams {
    const value = this.getAttribute("params");
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as BidParams;
      }
    } catch {
      console.warn(`[ad-bid] Invalid params JSON for bidder "${this.bidder}"`);
    }
    return {};
  }

  set params(value: BidParams | string) {
    if (typeof value === "string") {
      this.setAttribute("params", value);
    } else {
      this.setAttribute("params", JSON.stringify(value));
    }
  }

  /**
   * Convert this element to a Prebid bid object
   */
  toBid(): Bid {
    return {
      bidder: this.bidder,
      params: this.params,
    };
  }
}

customElements.define("ad-bid", AdBid);
