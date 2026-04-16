import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters";
import {
  AdapterRegistry,
  AdServerRegistry,
  HeaderBiddingRegistry,
} from "./registry";

function makeAdapter(name: string): HeaderBiddingAdapter {
  return {
    name,
    init() {},
    destroy() {},
  };
}

describe("AdapterRegistry", () => {
  test("register() stores an adapter retrievable via get()", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    const adapter = makeAdapter("prebid");
    registry.register("prebid", adapter);
    expect(registry.get("prebid")).toBe(adapter);
  });

  test("get() returns undefined for unknown name", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    expect(registry.get("unknown")).toBeUndefined();
  });

  test("getAll() returns all registered adapters in insertion order", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    const prebid = makeAdapter("prebid");
    const apstag = makeAdapter("apstag");
    registry.register("prebid", prebid);
    registry.register("apstag", apstag);
    const all = registry.getAll();
    expect(Array.from(all.keys())).toEqual(["prebid", "apstag"]);
    expect(all.get("prebid")).toBe(prebid);
    expect(all.get("apstag")).toBe(apstag);
  });

  test("getAll() returns a snapshot — mutating it does not affect the registry", () => {
    const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
    const adapter = makeAdapter("prebid");
    registry.register("prebid", adapter);
    const snapshot = registry.getAll();
    snapshot.delete("prebid");
    snapshot.set("fake", makeAdapter("fake"));
    expect(registry.get("prebid")).toBe(adapter);
    expect(registry.get("fake")).toBeUndefined();
  });

  describe("duplicate registration", () => {
    let warnSpy: ReturnType<typeof spyOn<Console, "warn">>;

    beforeEach(() => {
      warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test("warns via console.warn with registry label and adapter name", () => {
      const registry = new AdapterRegistry<HeaderBiddingAdapter>("MyRegistry");
      registry.register("prebid", makeAdapter("prebid"));
      registry.register("prebid", makeAdapter("prebid"));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0]);
      expect(message).toContain("MyRegistry");
      expect(message).toContain("prebid");
    });

    test("overwrites — get() returns the later adapter", () => {
      const registry = new AdapterRegistry<HeaderBiddingAdapter>("test");
      const first = makeAdapter("prebid");
      const second = makeAdapter("prebid");
      registry.register("prebid", first);
      registry.register("prebid", second);
      expect(registry.get("prebid")).toBe(second);
    });
  });
});

// The module singletons are process-scoped and cannot be reset — there is no
// public `unregister()`. This block is the only place that touches them, and
// it uses unique per-test names (suffixed `-independence-test`) so the state
// it leaves behind can never collide with anything else in this file. Any
// future singleton test must follow the same rule or be rewritten to use a
// fresh `new AdapterRegistry(...)` instance instead.
describe("module singletons", () => {
  test("AdServerRegistry and HeaderBiddingRegistry are independent", () => {
    const adServer: AdServerAdapter = {
      name: "gam-independence-test",
      init() {},
      destroy() {},
    };
    const headerBidder: HeaderBiddingAdapter = {
      name: "prebid-independence-test",
      init() {},
      destroy() {},
    };
    AdServerRegistry.register("gam-independence-test", adServer);
    HeaderBiddingRegistry.register("prebid-independence-test", headerBidder);
    expect(AdServerRegistry.get("gam-independence-test")).toBe(adServer);
    expect(AdServerRegistry.get("prebid-independence-test")).toBeUndefined();
    expect(HeaderBiddingRegistry.get("prebid-independence-test")).toBe(
      headerBidder,
    );
    expect(HeaderBiddingRegistry.get("gam-independence-test")).toBeUndefined();
  });
});

describe("TypeScript bivariance", () => {
  // Compile-time check: method bivariance lets a concrete adapter declare a
  // narrower `init(config: PrebidConfig)` and still be assignable to
  // `HeaderBiddingAdapter`. If TypeScript ever tightens method variance, this
  // file stops compiling. No default value on `config` so the guarantee
  // covers the required-argument case, not just the optional one.
  test("concrete adapter with narrowed required init() param is assignable", () => {
    interface PrebidConfig {
      units: Record<string, unknown>;
    }

    const PrebidAdapter: HeaderBiddingAdapter = {
      name: "prebid",
      init(config: PrebidConfig) {
        void config;
      },
      destroy() {},
    };

    const registry = new AdapterRegistry<HeaderBiddingAdapter>("bivariance");
    registry.register(PrebidAdapter.name, PrebidAdapter);
    expect(registry.get("prebid")).toBe(PrebidAdapter);
  });
});
