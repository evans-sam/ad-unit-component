import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AdBid } from "./ad-bid";

describe("AdBid", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe("registration", () => {
    test("is registered as a custom element", () => {
      const Constructor = customElements.get("ad-bid");
      expect(Constructor).toBe(AdBid);
    });

    test("extends HTMLElement", () => {
      const element = document.createElement("ad-bid");
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element).toBeInstanceOf(AdBid);
    });
  });

  describe("bidder property", () => {
    test("reflects bidder attribute", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "appnexus");
      expect(element.bidder).toBe("appnexus");
    });

    test("sets bidder attribute", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.bidder = "rubicon";
      expect(element.getAttribute("bidder")).toBe("rubicon");
    });

    test("returns empty string when not set", () => {
      const element = document.createElement("ad-bid") as AdBid;
      expect(element.bidder).toBe("");
    });
  });

  describe("toBid()", () => {
    test("returns bid object with bidder", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "appnexus");
      const bid = element.toBid();
      expect(bid.bidder).toBe("appnexus");
    });

    test("converts kebab-case attributes to camelCase params", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "appnexus");
      element.setAttribute("placement-id", "123456");
      element.setAttribute("site-id", "789");
      const bid = element.toBid();
      expect(bid.params.placementId).toBe(123456);
      expect(bid.params.siteId).toBe(789);
    });

    test("parses numeric values", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "test");
      element.setAttribute("count", "42");
      const bid = element.toBid();
      expect(bid.params.count).toBe(42);
    });

    test("parses JSON values", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "test");
      element.setAttribute("options", '{"key":"value"}');
      const bid = element.toBid();
      expect(bid.params.options).toEqual({ key: "value" });
    });

    test("keeps string values as strings", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "test");
      element.setAttribute("name", "my-placement");
      const bid = element.toBid();
      expect(bid.params.name).toBe("my-placement");
    });

    test("excludes bidder from params", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "appnexus");
      element.setAttribute("placement-id", "123");
      const bid = element.toBid();
      expect(bid.params.bidder).toBeUndefined();
    });

    test("handles boolean JSON values", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "test");
      element.setAttribute("enabled", "true");
      const bid = element.toBid();
      expect(bid.params.enabled).toBe(true);
    });
  });
});
