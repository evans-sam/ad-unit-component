import "../../src/index";
import "../event-log";
import { createMockAdapter } from "../mock-adapter";

const adapter = createMockAdapter();
adapter.start();

// Hide the scroll hint once the user has actually scrolled enough to trigger
// the first fetch zone — no need to keep nagging.
const hint = document.querySelector(".scroll-hint") as HTMLDivElement | null;
if (hint) {
  const hideHint = () => {
    hint.style.display = "none";
    window.removeEventListener("scroll", hideHint);
  };
  window.addEventListener("scroll", hideHint, { once: true });
}
