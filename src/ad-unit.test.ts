import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AdUnit, AdUnitLifecycleEvent } from "./ad-unit";

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

    test("ad-unit:connected is bubbles and composed, not cancelable", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:connected", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);

      const e = received as unknown as CustomEvent;
      expect(e.bubbles).toBe(true);
      expect(e.composed).toBe(true);
      expect(e.cancelable).toBe(false);
    });

    test("ad-unit:disconnected is bubbles and composed, not cancelable", () => {
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
      expect(e.cancelable).toBe(false);
    });

    test("lifecycle events are AdUnitLifecycleEvent instances", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let connectedEvent: Event | null = null;
      let fetchEvent: Event | null = null;
      let renderEvent: Event | null = null;
      element.addEventListener("ad-unit:connected", (e) => {
        connectedEvent = e;
      });
      element.addEventListener("ad-unit:fetch", (e) => {
        fetchEvent = e;
      });
      element.addEventListener("ad-unit:render", (e) => {
        renderEvent = e;
      });

      container.appendChild(element);

      expect(connectedEvent).toBeInstanceOf(AdUnitLifecycleEvent);
      expect(fetchEvent).toBeInstanceOf(AdUnitLifecycleEvent);
      expect(renderEvent).toBeInstanceOf(AdUnitLifecycleEvent);
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

  describe("refreshCount", () => {
    test("is 0 before any refresh call", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.refreshCount).toBe(0);
    });

    test("is 0 on connected event detail for initial cycle", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let detail: { refreshCount?: number } | undefined;
      element.addEventListener("ad-unit:connected", (e) => {
        detail = (e as CustomEvent).detail;
      });
      container.appendChild(element);
      expect(detail?.refreshCount).toBe(0);
    });

    test("is 0 on fetch and render event details for initial cycle", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let fetchDetail: { refreshCount?: number } | undefined;
      let renderDetail: { refreshCount?: number } | undefined;
      element.addEventListener("ad-unit:fetch", (e) => {
        fetchDetail = (e as CustomEvent).detail;
      });
      element.addEventListener("ad-unit:render", (e) => {
        renderDetail = (e as CustomEvent).detail;
      });
      container.appendChild(element);
      expect(fetchDetail?.refreshCount).toBe(0);
      expect(renderDetail?.refreshCount).toBe(0);
    });

    test("is 0 on disconnected event detail for initial cycle", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let detail: { refreshCount?: number } | undefined;
      element.addEventListener("ad-unit:disconnected", (e) => {
        detail = (e as CustomEvent).detail;
      });
      container.appendChild(element);
      container.removeChild(element);
      expect(detail?.refreshCount).toBe(0);
    });

    test("increments to 1 after first refresh, 2 after second", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      expect(element.refreshCount).toBe(0);
      element.refresh();
      expect(element.refreshCount).toBe(1);
      element.refresh();
      expect(element.refreshCount).toBe(2);
    });

    test("refresh, fetch, and render events in a refresh cycle all carry the new count", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      const seen: number[] = [];
      const capture = (e: Event) => {
        seen.push((e as CustomEvent).detail.refreshCount);
      };
      element.addEventListener("ad-unit:refresh", capture);
      element.addEventListener("ad-unit:fetch", capture);
      element.addEventListener("ad-unit:render", capture);

      element.refresh();

      expect(seen).toEqual([1, 1, 1]);
    });

    test("persists across disconnect and reconnect of the same instance", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      element.refresh();
      element.refresh();
      expect(element.refreshCount).toBe(2);

      container.removeChild(element);
      container.appendChild(element);

      expect(element.refreshCount).toBe(2);
    });

    test("is 2 on connected event detail after reconnect that followed two refreshes", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      element.refresh();
      element.refresh();

      let detail: { refreshCount?: number } | undefined;
      element.addEventListener("ad-unit:connected", (e) => {
        detail = (e as CustomEvent).detail;
      });

      container.removeChild(element);
      container.appendChild(element);

      expect(detail?.refreshCount).toBe(2);
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

    test("fetch and render events are bubbles and composed, not cancelable", () => {
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
        expect(e.cancelable).toBe(false);
      }
    });
  });

  describe("lazy mode", () => {
    test("creates fetch-zone observer on connect, render-zone observer after fetch triggers", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      expect(MockIntersectionObserver.instances).toHaveLength(1);
      expect(MockIntersectionObserver.instances[0].options.rootMargin).toBe(
        "200%",
      );

      MockIntersectionObserver.instances[0].trigger(element, true);
      // Wait two microtasks for promise resolution to propagate.
      await Promise.resolve();
      await Promise.resolve();
      expect(MockIntersectionObserver.instances).toHaveLength(2);
      expect(MockIntersectionObserver.instances[1].options.rootMargin).toBe(
        "150%",
      );
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

    test("fires ad-unit:fetch when fetch observer triggers", async () => {
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
      await Promise.resolve();
      await Promise.resolve();

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).detail.code).toBe("test-ad");
    });

    test("fires ad-unit:render when render observer triggers", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("code", "test-ad");

      let received: CustomEvent | null = null;
      element.addEventListener("ad-unit:render", (e) => {
        received = e as CustomEvent;
      });

      container.appendChild(element);
      // Enter fetch zone first
      MockIntersectionObserver.instances[0].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      // Now enter render zone
      MockIntersectionObserver.instances[1].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      expect(received).not.toBeNull();
      expect((received as unknown as CustomEvent).detail.code).toBe("test-ad");
    });

    test("uses default margins (200% fetch, 150% render)", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      const fetchObserver = MockIntersectionObserver.instances[0];
      expect(fetchObserver.options.rootMargin).toBe("200%");

      fetchObserver.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      const renderObserver = MockIntersectionObserver.instances[1];
      expect(renderObserver.options.rootMargin).toBe("150%");
    });

    test("uses custom margins from attributes", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("fetch-margin", "500px");
      element.setAttribute("render-margin", "100px");
      container.appendChild(element);

      const fetchObserver = MockIntersectionObserver.instances[0];
      expect(fetchObserver.options.rootMargin).toBe("500px");

      fetchObserver.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      const renderObserver = MockIntersectionObserver.instances[1];
      expect(renderObserver.options.rootMargin).toBe("100px");
    });

    test("each event fires at most once", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      let fetchCount = 0;
      let renderCount = 0;
      element.addEventListener("ad-unit:fetch", () => fetchCount++);
      element.addEventListener("ad-unit:render", () => renderCount++);

      container.appendChild(element);
      const fetchObserver = MockIntersectionObserver.instances[0];

      fetchObserver.trigger(element, true);
      fetchObserver.trigger(element, true); // second trigger should no-op (observer disconnected)
      await Promise.resolve();
      await Promise.resolve();

      const renderObserver = MockIntersectionObserver.instances[1];
      renderObserver.trigger(element, true);
      renderObserver.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchCount).toBe(1);
      expect(renderCount).toBe(1);
    });

    test("observer is disconnected after zone entered", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      const fetchObserver = MockIntersectionObserver.instances[0];
      expect(fetchObserver.observed.has(element)).toBe(true);

      fetchObserver.trigger(element, true);
      expect(fetchObserver.disconnected).toBe(true);

      await Promise.resolve();
      await Promise.resolve();

      const renderObserver = MockIntersectionObserver.instances[1];
      expect(renderObserver.observed.has(element)).toBe(true);
      renderObserver.trigger(element, true);
      expect(renderObserver.disconnected).toBe(true);
    });

    test("zone observers disconnected on element removal", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      container.appendChild(element);

      const fetchObserver = MockIntersectionObserver.instances[0];
      container.removeChild(element);

      expect(fetchObserver.disconnected).toBe(true);
    });

    test("reconnect resets lifecycle — events fire again", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      let fetchCount = 0;
      let renderCount = 0;
      element.addEventListener("ad-unit:fetch", () => fetchCount++);
      element.addEventListener("ad-unit:render", () => renderCount++);

      container.appendChild(element);
      MockIntersectionObserver.instances[0].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      MockIntersectionObserver.instances[1].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      expect(fetchCount).toBe(1);
      expect(renderCount).toBe(1);

      container.removeChild(element);
      container.appendChild(element);

      const newFetchObserver = MockIntersectionObserver.instances[2];
      newFetchObserver.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      const newRenderObserver = MockIntersectionObserver.instances[3];
      newRenderObserver.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchCount).toBe(2);
      expect(renderCount).toBe(2);
    });

    test("element already in view: fetch fires before render", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      const order: string[] = [];
      element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
      element.addEventListener("ad-unit:render", () => order.push("render"));

      container.appendChild(element);
      MockIntersectionObserver.instances[0].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      MockIntersectionObserver.instances[1].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      expect(order).toEqual(["fetch", "render"]);
    });

    test("non-intersecting entries are ignored", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      let fetchCount = 0;
      element.addEventListener("ad-unit:fetch", () => fetchCount++);

      container.appendChild(element);
      MockIntersectionObserver.instances[0].trigger(element, false);
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchCount).toBe(0);
    });

    test("lazy loading composes with user waitUntil on fetch", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");

      let resolveAuction: () => void;
      const auction = new Promise<void>((r) => {
        resolveAuction = r;
      });

      let renderFired = false;
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(auction);
      });
      element.addEventListener("ad-unit:render", () => {
        renderFired = true;
      });

      container.appendChild(element);
      // Enter fetch zone
      MockIntersectionObserver.instances[0].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      // Enter render zone — but auction still pending
      MockIntersectionObserver.instances[1].trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();
      expect(renderFired).toBe(false);

      resolveAuction!();
      await auction;
      await Promise.resolve();
      await Promise.resolve();

      expect(renderFired).toBe(true);
    });
  });

  describe("margin validation", () => {
    test("warns and clamps when fetch margin < render margin (same unit)", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("code", "test-ad");
      element.setAttribute("fetch-margin", "50%");
      element.setAttribute("render-margin", "100%");

      const warnSpy = spyOn(console, "warn");
      container.appendChild(element);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const fetchObs = MockIntersectionObserver.instances[0];
      expect(fetchObs.options.rootMargin).toBe("100%");

      fetchObs.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      const renderObs = MockIntersectionObserver.instances[1];
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

    test("skips validation when units differ", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("loading", "lazy");
      element.setAttribute("fetch-margin", "50px");
      element.setAttribute("render-margin", "100%");

      const warnSpy = spyOn(console, "warn");
      container.appendChild(element);

      expect(warnSpy).not.toHaveBeenCalled();
      const fetchObs = MockIntersectionObserver.instances[0];
      expect(fetchObs.options.rootMargin).toBe("50px");

      fetchObs.trigger(element, true);
      await Promise.resolve();
      await Promise.resolve();

      const renderObs = MockIntersectionObserver.instances[1];
      expect(renderObs.options.rootMargin).toBe("100%");
      warnSpy.mockRestore();
    });

    test("invalid fetch-margin surfaces via ad-unit:error", async () => {
      const OriginalIO = globalThis.IntersectionObserver;
      globalThis.IntersectionObserver = class {
        constructor(
          _cb: IntersectionObserverCallback,
          options: IntersectionObserverInit,
        ) {
          throw new Error(
            `Failed to construct 'IntersectionObserver': '${options.rootMargin}' is not a valid value`,
          );
        }
      } as unknown as typeof IntersectionObserver;

      try {
        const element = document.createElement("ad-unit") as AdUnit;
        element.setAttribute("code", "test-ad");
        element.setAttribute("loading", "lazy");
        element.setAttribute("fetch-margin", "banana");
        element.setAttribute("render-margin", "banana");

        let errorDetail: { stage: string; error: unknown } | null = null;
        element.addEventListener("ad-unit:error", (e) => {
          errorDetail = (e as CustomEvent).detail;
        });

        container.appendChild(element);
        await Promise.resolve();
        await Promise.resolve();

        expect(errorDetail).not.toBeNull();
        expect(errorDetail!.stage).toBe("connected");
        expect(errorDetail!.error).toBeInstanceOf(Error);
        expect((errorDetail!.error as Error).message).toContain(
          `[ad-unit "test-ad"] Invalid fetch-margin "banana":`,
        );
      } finally {
        globalThis.IntersectionObserver = OriginalIO;
      }
    });
  });

  describe("waitUntil (eager mode)", () => {
    test("zero waiters: all three events fire synchronously", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      const order: string[] = [];
      element.addEventListener("ad-unit:connected", () =>
        order.push("connected"),
      );
      element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
      element.addEventListener("ad-unit:render", () => order.push("render"));

      container.appendChild(element);

      // All three should have fired synchronously in connectedCallback.
      expect(order).toEqual(["connected", "fetch", "render"]);
    });

    test("waitUntil on connected defers fetch until promise resolves", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });

      let fetchFired = false;
      element.addEventListener("ad-unit:connected", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      });
      element.addEventListener("ad-unit:fetch", () => {
        fetchFired = true;
      });

      container.appendChild(element);
      expect(fetchFired).toBe(false); // async path

      resolve!();
      await gate;
      await Promise.resolve(); // let chained then run

      expect(fetchFired).toBe(true);
    });

    test("waitUntil on fetch defers render until promise resolves", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });

      let renderFired = false;
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      });
      element.addEventListener("ad-unit:render", () => {
        renderFired = true;
      });

      container.appendChild(element);
      expect(renderFired).toBe(false);

      resolve!();
      await gate;
      await Promise.resolve();

      expect(renderFired).toBe(true);
    });

    test("multiple waitUntil calls compose (Promise.all semantics)", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolveA: () => void;
      let resolveB: () => void;
      const gateA = new Promise<void>((r) => {
        resolveA = r;
      });
      const gateB = new Promise<void>((r) => {
        resolveB = r;
      });

      let renderFired = false;
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gateA);
      });
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gateB);
      });
      element.addEventListener("ad-unit:render", () => {
        renderFired = true;
      });

      container.appendChild(element);

      resolveA!();
      await gateA;
      await Promise.resolve();
      expect(renderFired).toBe(false); // B still pending

      resolveB!();
      await gateB;
      await Promise.resolve();
      expect(renderFired).toBe(true);
    });

    test("disconnect during async wait prevents subsequent stage", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });

      let fetchFired = false;
      element.addEventListener("ad-unit:connected", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      });
      element.addEventListener("ad-unit:fetch", () => {
        fetchFired = true;
      });

      container.appendChild(element);
      container.removeChild(element); // disconnect before gate resolves

      resolve!();
      await gate;
      await Promise.resolve();

      expect(fetchFired).toBe(false);
    });

    test("rejection halts lifecycle and fires ad-unit:error", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      const error = new Error("bid server down");

      let renderFired = false;
      let errorDetail: { stage: string; error: unknown } | null = null;
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(error));
      });
      element.addEventListener("ad-unit:render", () => {
        renderFired = true;
      });
      element.addEventListener("ad-unit:error", (e) => {
        errorDetail = (e as CustomEvent).detail;
      });

      container.appendChild(element);

      // Flush microtasks for the rejection to propagate.
      await Promise.resolve();
      await Promise.resolve();

      expect(renderFired).toBe(false);
      expect(errorDetail).not.toBeNull();
      expect(errorDetail!.stage).toBe("fetch");
      expect(errorDetail!.error).toBe(error);
    });

    test("AbortError on zone promise does not dispatch ad-unit:error", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      const abortError = new DOMException("ad-unit disconnected", "AbortError");

      let errorCount = 0;
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(abortError));
      });
      element.addEventListener("ad-unit:error", () => {
        errorCount++;
      });

      container.appendChild(element);

      await Promise.resolve();
      await Promise.resolve();

      expect(errorCount).toBe(0);
    });

    test("rejection after disconnect does not dispatch ad-unit:error", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let reject!: (reason: unknown) => void;
      const gate = new Promise<never>((_, r) => {
        reject = r;
      });
      let errorCount = 0;

      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      });
      element.addEventListener("ad-unit:error", () => {
        errorCount++;
      });

      container.appendChild(element);
      container.removeChild(element); // sets #aborted before rejection drains

      reject(new Error("disconnected race"));
      await Promise.resolve();
      await Promise.resolve();

      expect(errorCount).toBe(0);
    });

    test("adUnit.blocked is false before connect", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      expect(element.blocked).toBe(false);
    });

    test("adUnit.blocked is false after sync lifecycle completes", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);
      expect(element.blocked).toBe(false);
    });

    test("adUnit.blocked reflects pending waitUntil", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      });

      container.appendChild(element);
      expect(element.blocked).toBe(true);

      resolve!();
      await gate;
      await Promise.resolve();

      expect(element.blocked).toBe(false);
    });

    test("adUnit.blocked is false after rejection", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(Promise.reject(new Error("x")));
      });
      container.appendChild(element);

      await Promise.resolve();
      await Promise.resolve();

      expect(element.blocked).toBe(false);
    });

    test("stage-blocked and stage-unblocked fire around pending stage", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });
      const events: { type: string; stage: string }[] = [];
      element.addEventListener("ad-unit:fetch", (e) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      });
      element.addEventListener("ad-unit:stage-blocked", (e) => {
        events.push({
          type: "blocked",
          stage: (e as CustomEvent).detail.stage,
        });
      });
      element.addEventListener("ad-unit:stage-unblocked", (e) => {
        events.push({
          type: "unblocked",
          stage: (e as CustomEvent).detail.stage,
        });
      });

      container.appendChild(element);
      expect(events).toEqual([{ type: "blocked", stage: "fetch" }]);

      resolve!();
      await gate;
      await Promise.resolve();

      expect(events).toEqual([
        { type: "blocked", stage: "fetch" },
        { type: "unblocked", stage: "fetch" },
      ]);
    });

    test("reconnect with no waiters clears stale blocked state", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });
      const fetchHandler = (e: Event) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      };
      element.addEventListener("ad-unit:fetch", fetchHandler);

      container.appendChild(element);
      expect(element.blocked).toBe(true);

      container.removeChild(element);
      element.removeEventListener("ad-unit:fetch", fetchHandler);

      container.appendChild(element);
      expect(element.blocked).toBe(false);

      // Allow the stale gate to resolve — must not revive blocked state.
      resolve!();
      await gate;
      await Promise.resolve();

      expect(element.blocked).toBe(false);
    });

    test("reconnect while promise is pending does not fire stale stage-unblocked", async () => {
      const element = document.createElement("ad-unit") as AdUnit;
      let resolve: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });
      const fetchHandler = (e: Event) => {
        (e as AdUnitLifecycleEvent).waitUntil(gate);
      };
      element.addEventListener("ad-unit:fetch", fetchHandler);

      const unblockedStages: string[] = [];
      element.addEventListener("ad-unit:stage-unblocked", (e) => {
        unblockedStages.push((e as CustomEvent).detail.stage);
      });

      container.appendChild(element);
      container.removeChild(element);
      element.removeEventListener("ad-unit:fetch", fetchHandler);
      container.appendChild(element);

      resolve!();
      await gate;
      await Promise.resolve();
      await Promise.resolve();

      expect(unblockedStages).toEqual([]);
    });

    test("old cycle's finalize does not clear new cycle's blocked entry after reconnect", async () => {
      const element = document.createElement("ad-unit") as AdUnit;

      let resolveStale: () => void;
      const staleGate = new Promise<void>((r) => {
        resolveStale = r;
      });
      const staleHandler = (e: Event) => {
        (e as AdUnitLifecycleEvent).waitUntil(staleGate);
      };
      element.addEventListener("ad-unit:fetch", staleHandler);

      container.appendChild(element);
      expect(element.blocked).toBe(true);

      container.removeChild(element);
      element.removeEventListener("ad-unit:fetch", staleHandler);

      let resolveFresh: () => void;
      const freshGate = new Promise<void>((r) => {
        resolveFresh = r;
      });
      const freshHandler = (e: Event) => {
        (e as AdUnitLifecycleEvent).waitUntil(freshGate);
      };
      element.addEventListener("ad-unit:fetch", freshHandler);

      container.appendChild(element);
      expect(element.blocked).toBe(true);

      resolveStale!();
      await staleGate;
      await Promise.resolve();
      await Promise.resolve();

      // New cycle still pending — blocked must remain true.
      expect(element.blocked).toBe(true);

      resolveFresh!();
      await freshGate;
      await Promise.resolve();
      await Promise.resolve();

      expect(element.blocked).toBe(false);
    });
  });

  describe("AdUnitLifecycleEvent", () => {
    test("is a CustomEvent subclass", () => {
      const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
      expect(event).toBeInstanceOf(CustomEvent);
      expect(event).toBeInstanceOf(AdUnitLifecycleEvent);
      expect(event.type).toBe("ad-unit:fetch");
    });

    test("pending starts empty", () => {
      const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
      expect(event.pending).toEqual([]);
    });

    test("waitUntil pushes promise to pending when dispatching", () => {
      const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
      event.beginDispatch();
      const promise = Promise.resolve();
      event.waitUntil(promise);
      expect(event.pending).toHaveLength(1);
      event.endDispatch();
    });

    test("waitUntil wraps non-promise values in Promise.resolve", () => {
      const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
      event.beginDispatch();
      event.waitUntil("not a promise" as unknown as Promise<unknown>);
      expect(event.pending).toHaveLength(1);
      expect(event.pending[0]).toBeInstanceOf(Promise);
      event.endDispatch();
    });

    test("waitUntil throws outside dispatch", () => {
      const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
      expect(() => event.waitUntil(Promise.resolve())).toThrow(
        "waitUntil() must be called during event dispatch",
      );
    });

    test("waitUntil throws after dispatch ends", () => {
      const event = new AdUnitLifecycleEvent("ad-unit:fetch", { detail: {} });
      event.beginDispatch();
      event.endDispatch();
      expect(() => event.waitUntil(Promise.resolve())).toThrow();
    });
  });

  describe("refresh()", () => {
    test("dispatches ad-unit:refresh on the element", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      let fired = false;
      element.addEventListener("ad-unit:refresh", () => {
        fired = true;
      });
      element.refresh();
      expect(fired).toBe(true);
    });

    test("refresh event is an AdUnitLifecycleEvent with correct flags", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      let captured: Event | undefined;
      element.addEventListener("ad-unit:refresh", (e) => {
        captured = e;
      });
      element.refresh();

      expect(captured).toBeInstanceOf(AdUnitLifecycleEvent);
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
      expect(captured?.cancelable).toBe(false);
    });

    test("refresh event detail carries full configuration plus refreshCount", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      element.setAttribute("code", "test-ad");
      element.setAttribute("sizes", "300x250");
      element.setAttribute("gpid", "/123/home");
      element.setAttribute("pos", "1");
      container.appendChild(element);

      let detail:
        | {
            code?: string;
            sizes?: number[][];
            gpid?: string | null;
            pos?: number | null;
            container?: HTMLDivElement;
            refreshCount?: number;
          }
        | undefined;
      element.addEventListener("ad-unit:refresh", (e) => {
        detail = (e as CustomEvent).detail;
      });
      element.refresh();

      expect(detail?.code).toBe("test-ad");
      expect(detail?.sizes).toEqual([[300, 250]]);
      expect(detail?.gpid).toBe("/123/home");
      expect(detail?.pos).toBe(1);
      expect(detail?.container).toBe(element.container);
      expect(detail?.refreshCount).toBe(1);
    });

    test("refresh chains refresh → fetch → render in order", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      const order: string[] = [];
      element.addEventListener("ad-unit:refresh", () => order.push("refresh"));
      element.addEventListener("ad-unit:fetch", () => order.push("fetch"));
      element.addEventListener("ad-unit:render", () => order.push("render"));

      element.refresh();

      expect(order).toEqual(["refresh", "fetch", "render"]);
    });

    test("document-level listener receives ad-unit:refresh (bubbles + composed)", () => {
      const element = document.createElement("ad-unit") as AdUnit;
      container.appendChild(element);

      let fired = false;
      const handler = () => {
        fired = true;
      };
      document.addEventListener("ad-unit:refresh", handler);
      try {
        element.refresh();
      } finally {
        document.removeEventListener("ad-unit:refresh", handler);
      }
      expect(fired).toBe(true);
    });
  });
});
