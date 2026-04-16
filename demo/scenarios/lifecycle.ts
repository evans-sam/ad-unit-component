import "../../src/index";
import { type AdUnit, HeaderBiddingRegistry } from "../../src";
import "../event-log";
import { createMockAdapter } from "../mock-adapter";

const adapter = createMockAdapter();
HeaderBiddingRegistry.register(adapter.name, adapter);
adapter.init();

const dynamicHost = document.getElementById("dynamic-units") as HTMLDivElement;
const addBtn = document.getElementById("add-btn") as HTMLButtonElement;
const removeBtn = document.getElementById("remove-btn") as HTMLButtonElement;

const DYNAMIC_SIZES: Array<{ label: string; sizes: string }> = [
  { label: "Wide skyscraper · 160×600", sizes: "160x600" },
  { label: "Mobile banner · 320×50", sizes: "320x50" },
  { label: "Large rectangle · 336×280", sizes: "336x280" },
  { label: "Half page · 300×600", sizes: "300x600" },
];

let dynamicCount = 0;

function addAdUnit(): void {
  const spec = DYNAMIC_SIZES[dynamicCount % DYNAMIC_SIZES.length];
  const item = document.createElement("div");
  item.className = "ad-item";

  const label = document.createElement("span");
  label.className = "ad-item__label";
  label.textContent = spec.label;

  const unit = document.createElement("ad-unit") as AdUnit;
  const code = `dynamic-${++dynamicCount}`;
  unit.setAttribute("code", code);
  unit.setAttribute("sizes", spec.sizes);
  unit.textContent = code;

  item.append(label, unit);
  dynamicHost.appendChild(item);
  updateRemoveBtn();
}

function removeLast(): void {
  const last = dynamicHost.lastElementChild;
  if (last) last.remove();
  updateRemoveBtn();
}

function updateRemoveBtn(): void {
  removeBtn.disabled = dynamicHost.childElementCount === 0;
}

addBtn.addEventListener("click", addAdUnit);
removeBtn.addEventListener("click", removeLast);
updateRemoveBtn();
