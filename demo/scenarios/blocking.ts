import "../../src/index";
import type { AdUnit, AdUnitLifecycleEvent } from "../../src";
import "../event-log";
import { createMockAdapter } from "../mock-adapter";

const adapter = createMockAdapter();
adapter.start();

const gatedUnit = document.querySelector<AdUnit>("ad-unit[code='user-gated']");
const baselineUnit = document.querySelector<AdUnit>("ad-unit[code='baseline']");
const resolveBtn = document.getElementById("resolve-btn") as HTMLButtonElement;
const rejectBtn = document.getElementById("reject-btn") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
const baselineChip = document.getElementById(
  "state-baseline",
) as HTMLSpanElement;
const gatedChip = document.getElementById(
  "state-user-gated",
) as HTMLSpanElement;

interface Gate {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

let pendingGate: Gate | null = null;

if (gatedUnit) attachUserGate(gatedUnit);
if (baselineUnit) trackBlockedState(baselineUnit, baselineChip);

function attachUserGate(unit: AdUnit): void {
  unit.addEventListener("ad-unit:fetch", (e) => {
    const event = e as AdUnitLifecycleEvent;
    const promise = new Promise<void>((resolve, reject) => {
      pendingGate = { resolve, reject };
    });
    event.waitUntil(promise);
    setButtons(true);
    setChip(gatedChip, "blocked", "waitUntil pending");
  });

  unit.addEventListener("ad-unit:render", () => {
    setChip(gatedChip, "ready", "rendered");
    setButtons(false);
  });

  unit.addEventListener("ad-unit:error", (e) => {
    const detail = (e as CustomEvent<{ stage: string; error: unknown }>).detail;
    const reason =
      detail.error instanceof Error
        ? detail.error.message
        : String(detail.error);
    setChip(gatedChip, "error", `error: ${reason}`);
    setButtons(false);
    pendingGate = null;
  });
}

function trackBlockedState(unit: AdUnit, chip: HTMLSpanElement): void {
  unit.addEventListener("ad-unit:stage-blocked", () => {
    setChip(chip, "blocked", "auction pending");
  });
  unit.addEventListener("ad-unit:render", () => {
    setChip(chip, "ready", "rendered");
  });
}

function setButtons(enabled: boolean): void {
  resolveBtn.disabled = !enabled;
  rejectBtn.disabled = !enabled;
}

function setChip(
  chip: HTMLSpanElement,
  state: "idle" | "blocked" | "ready" | "error",
  label: string,
): void {
  chip.dataset.state = state;
  chip.textContent = label;
}

resolveBtn.addEventListener("click", () => {
  pendingGate?.resolve();
  pendingGate = null;
  setButtons(false);
});

rejectBtn.addEventListener("click", () => {
  pendingGate?.reject(new Error("user rejected the gate"));
  pendingGate = null;
  setButtons(false);
});

resetBtn.addEventListener("click", () => {
  if (!gatedUnit) return;
  // Use refresh() to start a fresh cycle without detaching the element.
  setChip(gatedChip, "idle", "idle");
  gatedUnit.refresh();
});
