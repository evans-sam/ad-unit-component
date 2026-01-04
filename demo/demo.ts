// Import components to register them
import "../src/index";
import type { AdUnit } from "../src";

// Mock pbjs for demo
window.pbjs = window.pbjs ?? { que: [] };
window.pbjs.que = window.pbjs.que || [];
window.pbjs.que.push(() => {
  window.pbjs?.setConfig({ debug: true });
});

// Display generated configs
function updateDebugInfo() {
  const adUnits = document.querySelectorAll("ad-unit") as NodeListOf<AdUnit>;
  const debugOutput = document.getElementById("debug-output");

  if (!debugOutput) return;

  const configs = Array.from(adUnits).map((unit) => {
    return unit.toAdUnit();
  });

  debugOutput.textContent = JSON.stringify(configs, null, 2);
}

// Run on load
document.addEventListener("DOMContentLoaded", () => {
  // Update debug display
  setTimeout(updateDebugInfo, 100);
});

console.log("[demo] Ad unit demo loaded with Prebid integration");
