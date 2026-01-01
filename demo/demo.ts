import type { AdUnit } from "../src/ad-unit";

// Debug: List all registered ad units on the page
function updateDebugInfo() {
  const adUnits = document.querySelectorAll('[is="ad-unit"]');
  const debugOutput = document.getElementById("debug-output");

  if (!debugOutput) return;

  const info = [
    `Ad Units Found: ${adUnits.length}`,
    "",
    ...Array.from(adUnits).map((unit, i) => {
      const slot = unit.getAttribute("data-slot") || "no-slot";
      const rect = unit.getBoundingClientRect();
      const hasShadow = unit.shadowRoot ? "yes" : "no";
      return `[${i + 1}] slot="${slot}" size=${rect.width}x${rect.height} shadowRoot=${hasShadow}`;
    }),
  ];

  debugOutput.textContent = info.join("\n");
}

// Run on load
document.addEventListener("DOMContentLoaded", () => {
  updateDebugInfo();

  // Trigger render on all ad units
  const adUnits = document.querySelectorAll(
    '[is="ad-unit"]',
  ) as NodeListOf<AdUnit>;
  adUnits.forEach((unit) => {
    unit.render();
  });

  // Update debug info after render
  setTimeout(updateDebugInfo, 100);
});

// Log for HMR confirmation
console.log("[demo] Ad unit demo loaded");
