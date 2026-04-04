import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AdUnit } from "./ad-unit";

describe("AdUnit", () => {
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

    test("sets empty string attribute instead of removing it", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("name", "test");
      element.name = "";
      expect(element.hasAttribute("name")).toBe(true);
      expect(element.getAttribute("name")).toBe("");
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

    test("returns null when all format entries are invalid", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("format", '[{"x":300},{"y":250}]');
      expect(element.format).toBeNull();
    });
  });

  describe("vendor decoupling", () => {
    test("does not have a toAdUnit method", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect("toAdUnit" in element).toBe(false);
    });

    test("does not observe a bids attribute", () => {
      expect(AdUnit.observedAttributes).not.toContain("bids");
    });

    test("does not reference window.pbjs on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");

      // Ensure no pbjs interaction
      // biome-ignore lint/suspicious/noExplicitAny: verifying vendor decoupling
      (window as any).pbjs = undefined;
      container.appendChild(element);

      // Should not throw or create window.pbjs
      // biome-ignore lint/suspicious/noExplicitAny: verifying vendor decoupling
      expect((window as any).pbjs).toBeUndefined();
    });

    test("does not reference window.pbjs on disconnect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      container.appendChild(element);

      // biome-ignore lint/suspicious/noExplicitAny: verifying vendor decoupling
      (window as any).pbjs = undefined;
      container.removeChild(element);

      // biome-ignore lint/suspicious/noExplicitAny: verifying vendor decoupling
      expect((window as any).pbjs).toBeUndefined();
    });
  });

  describe("lifecycle", () => {
    test("renders shadow DOM on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      expect(element.shadowRoot?.innerHTML).toContain("<slot>");
      expect(element.shadowRoot?.innerHTML).toContain(":host");
    });

    test("re-renders on attribute change while connected", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      element.setAttribute("code", "new-code");
      expect(element.shadowRoot?.innerHTML).toContain("<slot>");
    });

    test("does not re-render when same attribute value is set", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      element.setAttribute("code", "test-code");

      const renderSpy = spyOn(element, "render");
      element.setAttribute("code", "test-code");
      expect(renderSpy).not.toHaveBeenCalled();
    });

    test("does not render when attribute changes on disconnected element", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      container.removeChild(element);

      const renderSpy = spyOn(element, "render");
      element.setAttribute("code", "new-code");
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });
});
