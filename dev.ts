import demo from "./demo/index.html";

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": demo,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Dev server running at http://localhost:${server.port}`);
