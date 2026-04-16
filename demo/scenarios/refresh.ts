import "../../src/index";
import { type AdUnit, HeaderBiddingRegistry } from "../../src";
import "../event-log";
import { createMockAdapter } from "../mock-adapter";

const AUTO_INTERVAL_MS = 5000;

const adapter = createMockAdapter();
HeaderBiddingRegistry.register(adapter.name, adapter);
adapter.init();

const unit = document.querySelector<AdUnit>("ad-unit[code='refresh-unit']");
const countNode = document.getElementById("count") as HTMLElement;
const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement;
const burstBtn = document.getElementById("burst-btn") as HTMLButtonElement;
const autoBtn = document.getElementById("auto-btn") as HTMLButtonElement;
const autoStatus = document.getElementById("auto-status") as HTMLSpanElement;

let autoTimer: ReturnType<typeof setInterval> | null = null;

if (unit) {
  updateCount();
  unit.addEventListener("ad-unit:refresh", updateCount);
  unit.addEventListener("ad-unit:render", updateCount);
}

refreshBtn.addEventListener("click", () => {
  unit?.refresh();
});

burstBtn.addEventListener("click", () => {
  // Five refreshes in the same microtask — each bumps the cycle id, so
  // only the newest one's fetch/render complete. Earlier cycles go stale.
  for (let i = 0; i < 5; i++) unit?.refresh();
});

autoBtn.addEventListener("click", () => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    autoBtn.setAttribute("aria-pressed", "false");
    autoBtn.textContent = `Start ${AUTO_INTERVAL_MS / 1000}s auto-refresh`;
    autoStatus.textContent = "off";
    return;
  }
  autoTimer = setInterval(() => unit?.refresh(), AUTO_INTERVAL_MS);
  autoBtn.setAttribute("aria-pressed", "true");
  autoBtn.textContent = `Stop auto-refresh`;
  autoStatus.textContent = `firing every ${AUTO_INTERVAL_MS / 1000}s`;
});

function updateCount(): void {
  if (!unit) return;
  countNode.textContent = String(unit.refreshCount);
}
