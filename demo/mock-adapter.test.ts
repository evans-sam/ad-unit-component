import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "../src/index";
import type { AdUnit } from "../src";
import { createMockAdapter } from "./mock-adapter";

describe("createMockAdapter", () => {
  let host: HTMLDivElement;
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    adapter = createMockAdapter({ auctionDelayMs: 10 });
    adapter.start();
  });

  afterEach(() => {
    adapter.stop();
    host.remove();
  });

  function createUnit(attrs: Record<string, string> = {}): AdUnit {
    const unit = document.createElement("ad-unit") as AdUnit;
    unit.setAttribute("code", "test-unit");
    unit.setAttribute("sizes", "300x250");
    for (const [k, v] of Object.entries(attrs)) unit.setAttribute(k, v);
    return unit;
  }

  test("paints pending state into container on ad-unit:connected", () => {
    const unit = createUnit({ code: "pending-unit" });
    host.appendChild(unit);
    const mock = unit.container.querySelector(".mock-ad") as HTMLElement | null;
    expect(mock).not.toBeNull();
    expect(mock?.dataset.state).toBe("pending");
    expect(mock?.dataset.code).toBe("pending-unit");
    expect(mock?.textContent).toContain("auctioning");
  });

  test("repaints with rendered state after the simulated auction resolves", async () => {
    const unit = createUnit({ code: "rendered-unit", sizes: "728x90" });
    host.appendChild(unit);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const mock = unit.container.querySelector(".mock-ad") as HTMLElement | null;
    expect(mock?.dataset.state).toBe("rendered");
    expect(mock?.dataset.width).toBe("728");
    expect(mock?.dataset.height).toBe("90");
    expect(mock?.dataset.price).toMatch(/^\d+\.\d{2}$/);
    expect(mock?.textContent).toContain("CPM");
  });

  test("cancels pending auction when unit disconnects before it resolves", async () => {
    const unit = createUnit({ code: "canceled-unit" });
    host.appendChild(unit);
    const pendingMock = unit.container.querySelector(".mock-ad") as HTMLElement;
    expect(pendingMock.dataset.state).toBe("pending");

    unit.remove();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(pendingMock.dataset.state).toBe("pending");
  });

  test("stop() detaches listeners so further connections are ignored", () => {
    adapter.stop();
    const unit = createUnit({ code: "post-stop" });
    host.appendChild(unit);
    expect(unit.container.querySelector(".mock-ad")).toBeNull();
  });

  test("falls back to format when sizes is empty", () => {
    const unit = document.createElement("ad-unit") as AdUnit;
    unit.setAttribute("code", "format-unit");
    unit.setAttribute("format", '[{"w":336,"h":280}]');
    host.appendChild(unit);
    const mock = unit.container.querySelector(".mock-ad") as HTMLElement;
    expect(mock.dataset.width).toBe("336");
    expect(mock.dataset.height).toBe("280");
  });
});
