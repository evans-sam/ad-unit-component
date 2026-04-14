import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AdUnit } from "./ad-unit";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit;
  observed: Set<Element> = new Set();
  disconnected = false;

  constructor(
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
    this.disconnected = true;
  }

  takeRecords() {
    return [];
  }

  trigger(target: Element, isIntersecting: boolean) {
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: performance.now(),
        },
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

describe("AdUnit", () => {
  let container: HTMLDivElement;
  const OriginalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    MockIntersectionObserver.instances = [];
  });

  afterEach(() => {
    container.remove();
    globalThis.IntersectionObserver = OriginalIntersectionObserver;
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

    test("shadow DOM contains a managed container div", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      const div = element.shadowRoot?.querySelector('div[part="container"]');
      expect(div).not.toBeNull();
      expect(div).toBeInstanceOf(HTMLDivElement);
    });

    test("exposes container div via element.container", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      expect(element.container).toBeInstanceOf(HTMLDivElement);
      expect(element.container).toBe(
        element.shadowRoot?.querySelector('div[part="container"]'),
      );
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

  describe("lifecycle events", () => {
    test("fires ad-unit:connected synchronously on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:connected", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).type).toBe(
        "ad-unit:connected",
      );
    });

    test("fires ad-unit:disconnected when element leaves DOM", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      container.appendChild(element);

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:disconnected", (e) => {
        received = e as CustomEvent;
      });

      container.removeChild(element);

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).type).toBe(
        "ad-unit:disconnected",
      );
    });

    test("ad-unit:connected is bubbles, composed, cancelable", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:connected", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);

      const e = received as unknown as CustomEvent;
      expect(e.bubbles).toBe(true);
      expect(e.composed).toBe(true);
      expect(e.cancelable).toBe(true);
    });

    test("ad-unit:disconnected is bubbles, composed, cancelable", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:disconnected", (e) => {
        received = e as CustomEvent;
      });

      container.removeChild(element);

      const e = received as unknown as CustomEvent;
      expect(e.bubbles).toBe(true);
      expect(e.composed).toBe(true);
      expect(e.cancelable).toBe(true);
    });

    test("document-level listener receives ad-unit:connected (bubbles + composed)", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "header-ad");
      element.setAttribute("sizes", "728x90");

      let received: CustomEvent | null = null;
      const handler = (e: Event) => {
        received = e as CustomEvent;
      };
      document.addEventListener("ad-unit:connected", handler);

      try {
        container.appendChild(element);
      } finally {
        document.removeEventListener("ad-unit:connected", handler);
      }

      expect(received).not.toBeNull();
      const e = received as unknown as CustomEvent;
      expect(e.type).toBe("ad-unit:connected");
      expect(e.detail.code).toBe("header-ad");
      expect(e.detail.container).toBe(element.container);
    });

    test("ad-unit:disconnected detail carries full configuration", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute("gpid", "/1234/test");
      container.appendChild(element);

      let detail: Record<string, unknown> | null = null;
      element.addEventListener("ad-unit:disconnected", (e) => {
        detail = (e as CustomEvent).detail;
      });

      container.removeChild(element);

      expect(detail).not.toBeNull();
      const d = detail as unknown as {
        code: string;
        sizes: number[][];
        gpid: string | null;
        container: HTMLElement;
      };
      expect(d.code).toBe("test-ad");
      expect(d.sizes).toEqual([[300, 250]]);
      expect(d.gpid).toBe("/1234/test");
      expect(d.container).toBe(element.container);
    });

    test("ad-unit:connected detail carries full configuration", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "header-ad");
      element.setAttribute("sizes", "728x90,970x250");
      element.setAttribute("gpid", "/1234/homepage/header");
      element.setAttribute("pos", "1");
      element.setAttribute("format", '[{"w":728,"h":90}]');

      let detail: Record<string, unknown> | null = null;
      element.addEventListener("ad-unit:connected", (e) => {
        detail = (e as CustomEvent).detail;
      });

      container.appendChild(element);

      expect(detail).not.toBeNull();
      const d = detail as unknown as {
        code: string;
        sizes: number[][];
        gpid: string | null;
        pos: number | null;
        format: unknown;
        container: HTMLElement;
      };
      expect(d.code).toBe("header-ad");
      expect(d.sizes).toEqual([
        [728, 90],
        [970, 250],
      ]);
      expect(d.gpid).toBe("/1234/homepage/header");
      expect(d.pos).toBe(1);
      expect(d.format).toEqual([{ w: 728, h: 90 }]);
      expect(d.container).toBe(element.container);
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

  describe("loading property", () => {
    test("defaults to eager", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.loading).toBe("eager");
    });

    test("reflects loading attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      expect(element.loading).toBe("lazy");
    });

    test("sets loading attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.loading = "lazy";
      expect(element.getAttribute("loading")).toBe("lazy");
    });
  });

  describe("fetchMargin property", () => {
    test("defaults to 200%", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.fetchMargin).toBe("200%");
    });

    test("reflects fetch-margin attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("fetch-margin", "500px");
      expect(element.fetchMargin).toBe("500px");
    });

    test("sets fetch-margin attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.fetchMargin = "300px";
      expect(element.getAttribute("fetch-margin")).toBe("300px");
    });
  });

  describe("renderMargin property", () => {
    test("defaults to 150%", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.renderMargin).toBe("150%");
    });

    test("reflects render-margin attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("render-margin", "100px");
      expect(element.renderMargin).toBe("100px");
    });

    test("sets render-margin attribute", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.renderMargin = "50%";
      expect(element.getAttribute("render-margin")).toBe("50%");
    });
  });

  describe("eager mode (default)", () => {
    test("fires ad-unit:fetch synchronously on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:fetch", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).type).toBe("ad-unit:fetch");
    });

    test("fires ad-unit:render synchronously on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:render", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).type).toBe("ad-unit:render");
    });

    test("event order: connected, fetch, render", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      const order: string[] = [];

      element.addEventListener("ad-unit:connected", () =>
        order.push("connected"),
      );
      element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
      element.addEventListener("ad-unit:render", () => order.push("render"));

      container.appendChild(element);

      expect(order).toEqual(["connected", "fetch", "render"]);
    });

    test("does not create IntersectionObservers", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      expect(MockIntersectionObserver.instances).toHaveLength(0);
    });

    test("fetch event detail carries full configuration", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "header-ad");
      element.setAttribute("sizes", "728x90");
      element.setAttribute("gpid", "/1234/test");
      element.setAttribute("pos", "1");

      let detail: Record<string, unknown> | null = null;
      element.addEventListener("ad-unit:fetch", (e) => {
        detail = (e as CustomEvent).detail;
      });

      container.appendChild(element);

      expect(detail).not.toBeNull();
      const d = detail as unknown as {
        code: string;
        sizes: number[][];
        gpid: string | null;
        pos: number | null;
        format: unknown;
        container: HTMLElement;
      };
      expect(d.code).toBe("header-ad");
      expect(d.sizes).toEqual([[728, 90]]);
      expect(d.gpid).toBe("/1234/test");
      expect(d.pos).toBe(1);
      expect(d.container).toBe(element.container);
    });

    test("fetch and render events are bubbles, composed, cancelable", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      const events: CustomEvent[] = [];
      element.addEventListener("ad-unit:fetch", (e) =>
        events.push(e as CustomEvent),
      );
      element.addEventListener("ad-unit:render", (e) =>
        events.push(e as CustomEvent),
      );

      container.appendChild(element);

      expect(events).toHaveLength(2);
      for (const e of events) {
        expect(e.bubbles).toBe(true);
        expect(e.composed).toBe(true);
        expect(e.cancelable).toBe(true);
      }
    });
  });

  describe("lazy mode", () => {
    test("creates two IntersectionObservers on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      expect(MockIntersectionObserver.instances).toHaveLength(2);
    });

    test("does not fire fetch or render synchronously on connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      const events: string[] = [];
      element.addEventListener("ad-unit:fetch", () => events.push("fetch"));
      element.addEventListener("ad-unit:render", () => events.push("render"));

      container.appendChild(element);

      expect(events).toEqual([]);
    });

    test("fires ad-unit:fetch when fetch observer triggers", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("code", "test-ad");

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:fetch", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);
      const fetchObserver = MockIntersectionObserver.instances[0];
      fetchObserver.trigger(element, true);

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).detail.code).toBe("test-ad");
    });

    test("fires ad-unit:render when render observer triggers", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("code", "test-ad");

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:render", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);
      const renderObserver = MockIntersectionObserver.instances[1];
      renderObserver.trigger(element, true);

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).detail.code).toBe("test-ad");
    });

    test("uses default margins (200% fetch, 150% render)", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      const [fetchObs, renderObs] = MockIntersectionObserver.instances;
      expect(fetchObs.options.rootMargin).toBe("200%");
      expect(renderObs.options.rootMargin).toBe("150%");
    });

    test("uses custom margins from attributes", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("fetch-margin", "500px");
      element.setAttribute("render-margin", "100px");
      container.appendChild(element);

      const [fetchObs, renderObs] = MockIntersectionObserver.instances;
      expect(fetchObs.options.rootMargin).toBe("500px");
      expect(renderObs.options.rootMargin).toBe("100px");
    });

    test("each event fires at most once", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      let fetchCount = 0;
      let renderCount = 0;
      element.addEventListener("ad-unit:fetch", () => fetchCount++);
      element.addEventListener("ad-unit:render", () => renderCount++);

      container.appendChild(element);
      const [fetchObs, renderObs] = MockIntersectionObserver.instances;

      fetchObs.trigger(element, true);
      fetchObs.trigger(element, true);
      renderObs.trigger(element, true);
      renderObs.trigger(element, true);

      expect(fetchCount).toBe(1);
      expect(renderCount).toBe(1);
    });

    test("unobserves after event fires", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      const [fetchObs, renderObs] = MockIntersectionObserver.instances;
      expect(fetchObs.observed.has(element)).toBe(true);

      fetchObs.trigger(element, true);
      expect(fetchObs.observed.has(element)).toBe(false);

      renderObs.trigger(element, true);
      expect(renderObs.observed.has(element)).toBe(false);
    });

    test("observers disconnected on element removal", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      const [fetchObs, renderObs] = MockIntersectionObserver.instances;
      container.removeChild(element);

      expect(fetchObs.disconnected).toBe(true);
      expect(renderObs.disconnected).toBe(true);
    });

    test("reconnect resets lifecycle — events fire again", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      let fetchCount = 0;
      let renderCount = 0;
      element.addEventListener("ad-unit:fetch", () => fetchCount++);
      element.addEventListener("ad-unit:render", () => renderCount++);

      container.appendChild(element);
      MockIntersectionObserver.instances[0].trigger(element, true);
      MockIntersectionObserver.instances[1].trigger(element, true);
      expect(fetchCount).toBe(1);
      expect(renderCount).toBe(1);

      container.removeChild(element);
      container.appendChild(element);

      const newFetchObs = MockIntersectionObserver.instances[2];
      const newRenderObs = MockIntersectionObserver.instances[3];
      newFetchObs.trigger(element, true);
      newRenderObs.trigger(element, true);

      expect(fetchCount).toBe(2);
      expect(renderCount).toBe(2);
    });

    test("element already in view: fetch fires before render", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      const order: string[] = [];
      element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
      element.addEventListener("ad-unit:render", () => order.push("render"));

      container.appendChild(element);
      const renderObserver = MockIntersectionObserver.instances[1];
      renderObserver.trigger(element, true);

      expect(order).toEqual(["fetch", "render"]);
    });

    test("non-intersecting entries are ignored", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      let fetchCount = 0;
      element.addEventListener("ad-unit:fetch", () => fetchCount++);

      container.appendChild(element);
      MockIntersectionObserver.instances[0].trigger(element, false);

      expect(fetchCount).toBe(0);
    });
  });

  describe("margin validation", () => {
    test("warns and clamps when fetch margin < render margin (same unit)", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("code", "test-ad");
      element.setAttribute("fetch-margin", "50%");
      element.setAttribute("render-margin", "100%");

      const warnSpy = spyOn(console, "warn");
      container.appendChild(element);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [fetchObs, renderObs] = MockIntersectionObserver.instances;
      expect(fetchObs.options.rootMargin).toBe("100%");
      expect(renderObs.options.rootMargin).toBe("100%");
      warnSpy.mockRestore();
    });

    test("warns and clamps with px units", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("fetch-margin", "50px");
      element.setAttribute("render-margin", "200px");

      const warnSpy = spyOn(console, "warn");
      container.appendChild(element);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [fetchObs] = MockIntersectionObserver.instances;
      expect(fetchObs.options.rootMargin).toBe("200px");
      warnSpy.mockRestore();
    });

    test("skips validation when units differ", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("fetch-margin", "50px");
      element.setAttribute("render-margin", "100%");

      const warnSpy = spyOn(console, "warn");
      container.appendChild(element);

      expect(warnSpy).not.toHaveBeenCalled();
      const [fetchObs, renderObs] = MockIntersectionObserver.instances;
      expect(fetchObs.options.rootMargin).toBe("50px");
      expect(renderObs.options.rootMargin).toBe("100%");
      warnSpy.mockRestore();
    });

    test("invalid margin throws with helpful context", () => {
      const OrigMock = globalThis.IntersectionObserver;
      globalThis.IntersectionObserver = class ThrowingObserver {
        constructor(_cb: unknown, options: IntersectionObserverInit) {
          throw new Error(
            `rootMargin must be specified in pixels or percent: ${options.rootMargin}`,
          );
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;

      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("code", "test-ad");
      element.setAttribute("fetch-margin", "banana");

      expect(() => container.appendChild(element)).toThrow(
        '[ad-unit "test-ad"] Invalid fetch-margin "banana"',
      );

      globalThis.IntersectionObserver = OrigMock;
    });
  });
});
