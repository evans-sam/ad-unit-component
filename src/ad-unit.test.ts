import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AdUnit } from "./ad-unit";
import "./ad-bid"; // Ensure AdBid is registered

describe("AdUnit", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    // Mock pbjs
    window.pbjs = {
      que: [],
      addAdUnits: () => {},
      removeAdUnit: () => {},
    };
  });

  afterEach(() => {
    container.remove();
    window.pbjs = undefined;
  });

  describe("registration", () => {
    test("is registered as a custom element", () => {
      const Constructor = customElements.get("ad-unit");
      expect(Constructor).toBe(AdUnit);
    });

    test("extends HTMLElement", () => {
      const element = document.createElement("ad-unit");
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element).toBeInstanceOf(AdUnit);
    });
  });

  describe("shadow DOM", () => {
    test("attaches an open shadow root", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.shadowRoot).not.toBeNull();
      expect(element.shadowRoot?.mode).toBe("open");
    });

    test("renders slot for content projection", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      expect(element.shadowRoot?.innerHTML).toContain("<slot>");
    });
  });

  describe("code property", () => {
    test("reflects code attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "header-ad");
      expect(element.code).toBe("header-ad");
    });

    test("falls back to id attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.id = "sidebar-ad";
      expect(element.code).toBe("sidebar-ad");
    });

    test("sets code attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.code = "footer-ad";
      expect(element.getAttribute("code")).toBe("footer-ad");
    });
  });

  describe("sizes property", () => {
    test("parses sizes attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("sizes", "300x250,728x90");
      expect(element.sizes).toEqual([
        [300, 250],
        [728, 90],
      ]);
    });

    test("accepts array and serializes", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.sizes = [[300, 250]];
      expect(element.getAttribute("sizes")).toBe("[[300,250]]");
    });

    test("accepts string", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.sizes = "728x90";
      expect(element.sizes).toEqual([[728, 90]]);
    });
  });

  describe("gpid property", () => {
    test("reflects gpid attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("gpid", "/1234/homepage/header");
      expect(element.gpid).toBe("/1234/homepage/header");
    });

    test("sets gpid attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.gpid = "/1234/homepage/sidebar";
      expect(element.getAttribute("gpid")).toBe("/1234/homepage/sidebar");
    });

    test("removes attribute when set to null", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("gpid", "/1234/test");
      element.gpid = null;
      expect(element.hasAttribute("gpid")).toBe(false);
    });
  });

  describe("pos property", () => {
    test("parses pos attribute as number", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("pos", "1");
      expect(element.pos).toBe(1);
    });

    test("returns null when not set", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.pos).toBeNull();
    });

    test("sets pos attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.pos = 2;
      expect(element.getAttribute("pos")).toBe("2");
    });

    test("removes attribute when set to null", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("pos", "1");
      element.pos = null;
      expect(element.hasAttribute("pos")).toBe(false);
    });

    test("returns null for invalid pos value", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("pos", "invalid");
      expect(element.pos).toBeNull();
    });
  });

  describe("name property", () => {
    test("reflects name attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("name", "header-banner");
      expect(element.name).toBe("header-banner");
    });

    test("returns null when not set", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.name).toBeNull();
    });

    test("sets name attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.name = "sidebar-debug";
      expect(element.getAttribute("name")).toBe("sidebar-debug");
    });

    test("removes attribute when set to null", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("name", "test");
      element.name = null;
      expect(element.hasAttribute("name")).toBe(false);
    });
  });

  describe("format property", () => {
    test("parses format attribute as BannerFormat array", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("format", '[{"w":300,"h":250},{"w":728,"h":90}]');
      expect(element.format).toEqual([
        { w: 300, h: 250 },
        { w: 728, h: 90 },
      ]);
    });

    test("returns null when not set", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.format).toBeNull();
    });

    test("sets format from array", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.format = [{ w: 320, h: 50 }];
      expect(element.getAttribute("format")).toBe('[{"w":320,"h":50}]');
    });

    test("sets format from string", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.format = '[{"w":300,"h":600}]';
      expect(element.format).toEqual([{ w: 300, h: 600 }]);
    });

    test("removes attribute when set to null", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("format", '[{"w":300,"h":250}]');
      element.format = null;
      expect(element.hasAttribute("format")).toBe(false);
    });

    test("returns null for invalid JSON", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("format", "invalid-json");
      expect(element.format).toBeNull();
    });

    test("filters out invalid format objects", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute(
        "format",
        '[{"w":300,"h":250},{"invalid":true},{"w":"string","h":90}]',
      );
      expect(element.format).toEqual([{ w: 300, h: 250 }]);
    });
  });

  describe("toAdUnit()", () => {
    test("returns basic config with code and sizes", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      const config = element.toAdUnit();
      expect(config.code).toBe("test-ad");
      expect(config.mediaTypes.banner?.sizes).toEqual([[300, 250]]);
    });

    test("includes gpid in ortb2Imp", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute("gpid", "/1234/test");
      const config = element.toAdUnit();
      expect(config.ortb2Imp?.ext?.gpid).toBe("/1234/test");
    });

    test("includes pos in banner mediaType", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute("pos", "1");
      const config = element.toAdUnit();
      expect(config.mediaTypes.banner?.pos).toBe(1);
    });

    test("includes name in banner mediaType", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute("name", "debug-banner");
      const config = element.toAdUnit();
      expect(config.mediaTypes.banner?.name).toBe("debug-banner");
    });

    test("uses format instead of sizes when both provided", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute("format", '[{"w":320,"h":50}]');
      const config = element.toAdUnit();
      expect(config.mediaTypes.banner?.format).toEqual([{ w: 320, h: 50 }]);
      expect(config.mediaTypes.banner?.sizes).toBeUndefined();
    });

    test("uses format alone without sizes", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("format", '[{"w":728,"h":90}]');
      const config = element.toAdUnit();
      expect(config.mediaTypes.banner?.format).toEqual([{ w: 728, h: 90 }]);
      expect(config.mediaTypes.banner?.sizes).toBeUndefined();
    });

    test("includes all banner properties together", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250,728x90");
      element.setAttribute("pos", "1");
      element.setAttribute("name", "atf-banner");
      element.setAttribute("gpid", "/1234/homepage/header");
      const config = element.toAdUnit();
      expect(config.mediaTypes.banner).toEqual({
        sizes: [
          [300, 250],
          [728, 90],
        ],
        pos: 1,
        name: "atf-banner",
      });
      expect(config.ortb2Imp?.ext?.gpid).toBe("/1234/homepage/header");
    });

    test("collects bids from attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute(
        "bids",
        '[{"bidder":"appnexus","params":{"placementId":123}}]',
      );
      const config = element.toAdUnit();
      expect(config.bids).toHaveLength(1);
      expect(config.bids?.[0]?.bidder).toBe("appnexus");
      expect(config.bids?.[0]?.params.placementId).toBe(123);
    });

    test("collects bids from child elements", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");

      const bid = document.createElement("ad-bid");
      bid.setAttribute("bidder", "rubicon");
      bid.setAttribute("params", '{"accountId": 1001}');
      element.appendChild(bid);

      const config = element.toAdUnit();
      expect(config.bids).toHaveLength(1);
      expect(config.bids?.[0]?.bidder).toBe("rubicon");
      expect(config.bids?.[0]?.params.accountId).toBe(1001);
    });

    test("combines bids from attribute and children", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute(
        "bids",
        '[{"bidder":"appnexus","params":{"placementId":123}}]',
      );

      const bid = document.createElement("ad-bid");
      bid.setAttribute("bidder", "rubicon");
      bid.setAttribute("params", '{"accountId": 1001}');
      element.appendChild(bid);

      const config = element.toAdUnit();
      expect(config.bids).toHaveLength(2);
      expect(config.bids?.[0]?.bidder).toBe("appnexus");
      expect(config.bids?.[1]?.bidder).toBe("rubicon");
    });
  });

  describe("Prebid integration", () => {
    test("registers with Prebid on connect", () => {
      let registered = false;
      window.pbjs = {
        que: [],
        addAdUnits: () => {
          registered = true;
        },
        removeAdUnit: () => {},
      };

      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      container.appendChild(element);

      // Execute queued commands
      window.pbjs?.que.forEach((fn: () => void) => {
        fn();
      });

      expect(registered).toBe(true);
    });

    test("unregisters from Prebid on disconnect", () => {
      let unregisteredCode = "";
      window.pbjs = {
        que: [],
        addAdUnits: () => {},
        removeAdUnit: (code: string) => {
          unregisteredCode = code;
        },
      };

      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      container.appendChild(element);
      container.removeChild(element);

      // Execute queued commands
      window.pbjs?.que.forEach((fn: () => void) => {
        fn();
      });

      expect(unregisteredCode).toBe("test-ad");
    });

    test("does not register without code", () => {
      let registerCalled = false;
      window.pbjs = {
        que: [],
        addAdUnits: () => {
          registerCalled = true;
        },
        removeAdUnit: () => {},
      };

      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("sizes", "300x250");
      container.appendChild(element);

      // Execute queued commands
      window.pbjs?.que.forEach((fn: () => void) => {
        fn();
      });

      expect(registerCalled).toBe(false);
    });
  });
});
