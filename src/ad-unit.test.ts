import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
    test("is registered as a customized built-in element", () => {
      const Constructor = customElements.get("ad-unit");
      expect(Constructor).toBe(AdUnit);
    });

    test("extends HTMLDivElement", () => {
      const element = document.createElement("div", { is: "ad-unit" });
      expect(element).toBeInstanceOf(HTMLDivElement);
      expect(element).toBeInstanceOf(AdUnit);
    });
  });

  describe("shadow DOM", () => {
    test("attaches an open shadow root", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      expect(element.shadowRoot).not.toBeNull();
      expect(element.shadowRoot?.mode).toBe("open");
    });

    test("shadow root is accessible", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      container.appendChild(element);
      expect(element.shadowRoot).toBeDefined();
    });
  });

  describe("rendering", () => {
    test("render() populates shadow DOM", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      container.appendChild(element);
      element.render();
      expect(element.shadowRoot?.innerHTML).toContain("<div>");
    });

    test("shadow DOM is initially empty before render", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      // Before render() is called, shadowRoot should be empty
      expect(element.shadowRoot?.innerHTML).toBe("");
    });
  });

  describe("DOM integration", () => {
    test("can be created via constructor", () => {
      const element = new AdUnit();
      expect(element).toBeInstanceOf(AdUnit);
      expect(element.shadowRoot).not.toBeNull();
    });

    test("can be appended to document", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      container.appendChild(element);
      expect(container.contains(element)).toBe(true);
    });

    test("can be queried from document", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      element.id = "test-ad";
      container.appendChild(element);
      const found = document.getElementById("test-ad");
      expect(found).toBe(element);
    });
  });

  describe("attributes", () => {
    test("can set and get attributes", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      element.setAttribute("data-slot", "header-ad");
      expect(element.getAttribute("data-slot")).toBe("header-ad");
    });

    test("can set id attribute", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      element.id = "my-ad-unit";
      expect(element.id).toBe("my-ad-unit");
    });

    test("can set class attribute", () => {
      const element = document.createElement("div", {
        is: "ad-unit",
      }) as AdUnit;
      element.className = "ad-container sidebar";
      expect(element.classList.contains("ad-container")).toBe(true);
      expect(element.classList.contains("sidebar")).toBe(true);
    });
  });
});
