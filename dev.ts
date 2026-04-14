import index from "./demo/index.html";
import blocking from "./demo/scenarios/blocking.html";
import lifecycle from "./demo/scenarios/lifecycle.html";
import refresh from "./demo/scenarios/refresh.html";
import registry from "./demo/scenarios/registry.html";
import viewport from "./demo/scenarios/viewport.html";

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/scenarios/lifecycle": lifecycle,
    "/scenarios/viewport": viewport,
    "/scenarios/blocking": blocking,
    "/scenarios/refresh": refresh,
    "/scenarios/registry": registry,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Dev server running at http://localhost:${server.port}`);
