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

  describe("params property", () => {
    test("parses params JSON attribute", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("params", '{"placementId": 123456}');
      expect(element.params).toEqual({ placementId: 123456 });
    });

    test("returns empty object when not set", () => {
      const element = document.createElement("ad-bid") as AdBid;
      expect(element.params).toEqual({});
    });

    test("returns empty object for invalid JSON", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("params", "invalid-json");
      expect(element.params).toEqual({});
    });

    test("sets params from object", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.params = { siteId: 999 };
      expect(element.getAttribute("params")).toBe('{"siteId":999}');
    });

    test("sets params from string", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.params = '{"zoneId": 555}';
      expect(element.params).toEqual({ zoneId: 555 });
    });

    test("preserves string types in params", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("params", '{"publisherId": "156276"}');
      expect(element.params.publisherId).toBe("156276");
      expect(typeof element.params.publisherId).toBe("string");
    });

    test("preserves number types in params", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("params", '{"placementId": 13144370}');
      expect(element.params.placementId).toBe(13144370);
      expect(typeof element.params.placementId).toBe("number");
    });

    test("handles nested objects", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute(
        "params",
        '{"video": {"mimes": ["video/mp4"], "maxduration": 30}}',
      );
      expect(element.params).toEqual({
        video: { mimes: ["video/mp4"], maxduration: 30 },
      });
    });

    test("handles arrays", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("params", '{"keywords": ["sports", "news"]}');
      expect(element.params.keywords).toEqual(["sports", "news"]);
    });

    test("handles boolean values", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("params", '{"coppa": true, "gdpr": false}');
      expect(element.params.coppa).toBe(true);
      expect(element.params.gdpr).toBe(false);
    });
  });

  describe("toBid()", () => {
    test("returns bid object with bidder and params", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "appnexus");
      element.setAttribute("params", '{"placementId": 13144370}');
      const bid = element.toBid();
      expect(bid).toEqual({
        bidder: "appnexus",
        params: { placementId: 13144370 },
      });
    });

    test("returns empty params when not set", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "test");
      const bid = element.toBid();
      expect(bid.params).toEqual({});
    });

    test("handles PubMatic with string publisherId", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "pubmatic");
      element.setAttribute(
        "params",
        '{"publisherId": "156276", "adSlot": "div-gpt-ad-1"}',
      );
      const bid = element.toBid();
      expect(bid.params.publisherId).toBe("156276");
      expect(typeof bid.params.publisherId).toBe("string");
    });

    test("handles complex bidder config", () => {
      const element = document.createElement("ad-bid") as AdBid;
      element.setAttribute("bidder", "rubicon");
      element.setAttribute(
        "params",
        '{"accountId": 14062, "siteId": 70608, "zoneId": 498816, "inventory": {"rating": "5"}}',
      );
      const bid = element.toBid();
      expect(bid).toEqual({
        bidder: "rubicon",
        params: {
          accountId: 14062,
          siteId: 70608,
          zoneId: 498816,
          inventory: { rating: "5" },
        },
      });
    });
  });
});
