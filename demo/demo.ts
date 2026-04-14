import "../src/index";
import type { AdUnit } from "../src";

function updateDebugInfo() {
  const adUnits = document.querySelectorAll("ad-unit") as NodeListOf<AdUnit>;
  const debugOutput = document.getElementById("debug-output");

  if (!debugOutput) return;

  const configs = Array.from(adUnits).map((unit) => ({
    code: unit.code,
    sizes: unit.sizes,
    gpid: unit.gpid,
    pos: unit.pos,
    format: unit.format,
    name: unit.name,
  }));

  debugOutput.textContent = JSON.stringify(configs, null, 2);
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(updateDebugInfo, 100);
});

console.log("[demo] Ad unit demo loaded");
