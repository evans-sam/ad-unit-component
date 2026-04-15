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

  test("paints pending state into container on ad-unit:fetch", () => {
    const unit = createUnit({ code: "pending-unit" });
    host.appendChild(unit);
    const mock = unit.container.querySelector(".mock-ad") as HTMLElement | null;
    expect(mock).not.toBeNull();
    expect(mock?.dataset.state).toBe("pending");
    expect(mock?.dataset.code).toBe("pending-unit");
    expect(mock?.dataset.refreshCount).toBe("0");
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
    expect(mock?.dataset.refreshCount).toBe("0");
    expect(mock?.textContent).toContain("CPM");
  });

  test("waitUntil on fetch defers render until auction resolves", async () => {
    const unit = createUnit({ code: "blocked-unit" });
    host.appendChild(unit);

    // Immediately after append, fetch has fired and adapter attached waitUntil.
    // Render must not have fired yet — unit stays pending.
    expect(unit.blocked).toBe(true);
    expect(unit.container.querySelector(".mock-ad")?.dataset.state).toBe(
      "pending",
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(unit.blocked).toBe(false);
    expect(unit.container.querySelector(".mock-ad")?.dataset.state).toBe(
      "rendered",
    );
  });

  test("cancels pending auction when unit disconnects before it resolves", async () => {
    const unit = createUnit({ code: "canceled-unit" });
    host.appendChild(unit);
    const pendingMock = unit.container.querySelector(".mock-ad") as HTMLElement;
    expect(pendingMock.dataset.state).toBe("pending");

    unit.remove();
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Placard stays on last-painted state; adapter does not repaint after disconnect.
    expect(pendingMock.dataset.state).toBe("pending");
  });

  test("refresh triggers a new pending → rendered cycle with incremented refreshCount", async () => {
    const unit = createUnit({ code: "refresh-unit" });
    host.appendChild(unit);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const firstMock = unit.container.querySelector(
      ".mock-ad",
    ) as HTMLElement | null;
    expect(firstMock?.dataset.state).toBe("rendered");
    expect(firstMock?.dataset.refreshCount).toBe("0");

    unit.refresh();
    const pendingMock = unit.container.querySelector(
      ".mock-ad",
    ) as HTMLElement | null;
    expect(pendingMock?.dataset.state).toBe("pending");
    expect(pendingMock?.dataset.refreshCount).toBe("1");
    expect(pendingMock?.textContent).toContain("refresh #1");

    await new Promise((resolve) => setTimeout(resolve, 30));
    const finalMock = unit.container.querySelector(
      ".mock-ad",
    ) as HTMLElement | null;
    expect(finalMock?.dataset.state).toBe("rendered");
    expect(finalMock?.dataset.refreshCount).toBe("1");
    expect(finalMock?.textContent).toContain("refresh #1");
  });

  test("refresh mid-auction preempts the in-flight cycle cleanly", async () => {
    const unit = createUnit({ code: "preempt-unit" });
    host.appendChild(unit);
    // Immediately refresh before the first auction resolves.
    unit.refresh();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const mock = unit.container.querySelector(".mock-ad") as HTMLElement | null;
    expect(mock?.dataset.state).toBe("rendered");
    expect(mock?.dataset.refreshCount).toBe("1");
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
