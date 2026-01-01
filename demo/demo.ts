// Import components to register them
import "../src/index";
import type { AdUnit } from "../src/ad-unit";

// Mock pbjs for demo
window.pbjs = window.pbjs || { que: [] };
window.pbjs.que = window.pbjs.que || [];
window.pbjs.addAdUnits = (config) => {
  console.log("[pbjs.addAdUnits]", config);
};
window.pbjs.removeAdUnit = (code) => {
  console.log("[pbjs.removeAdUnit]", code);
};

// Process the queue
function processQueue() {
  while (window.pbjs?.que.length > 0) {
    const fn = window.pbjs?.que.shift();
    fn?.();
  }
}

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
  // Process any queued Prebid commands
  processQueue();

  // Update debug display
  setTimeout(updateDebugInfo, 100);
});

console.log("[demo] Ad unit demo loaded with Prebid integration");
