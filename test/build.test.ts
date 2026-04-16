import { describe, expect, test } from "bun:test";

async function buildAll() {
  const pkg = await Bun.file("./package.json").json();
  const adapterSubpaths = Object.keys(pkg.exports).filter(
    (key: string) => key.startsWith("./adapters/") && !key.includes("*"),
  );
  const entrypoints = [
    "./src/index.ts",
    ...adapterSubpaths.map((key) => `./src${key.slice(1)}.ts`),
  ];
  return Bun.build({
    entrypoints,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
  });
}

describe("build: subpath exports", () => {
  test("every enumerated adapter subpath has a matching source file", async () => {
    const pkg = await Bun.file("./package.json").json();
    const subpaths = Object.keys(pkg.exports).filter(
      (key: string) => key.startsWith("./adapters/") && !key.includes("*"),
    );
    expect(subpaths.length).toBeGreaterThan(0);
    for (const key of subpaths) {
      const src = `./src${key.slice(1)}.ts`;
      expect(await Bun.file(src).exists()).toBe(true);
    }
  });

  test("Bun.build emits one entry-point per entrypoint", async () => {
    const result = await buildAll();
    expect(result.success).toBe(true);

    const entries = result.outputs.filter((o) => o.kind === "entry-point");
    expect(entries).toHaveLength(4);

    const paths = entries.map((o) => o.path);
    expect(paths.some((p) => p.endsWith("index.js"))).toBe(true);
    expect(paths.some((p) => p.endsWith("adapters/gam.js"))).toBe(true);
    expect(paths.some((p) => p.endsWith("adapters/prebid.js"))).toBe(true);
    expect(paths.some((p) => p.endsWith("adapters/apstag.js"))).toBe(true);
  });

  test("core bundle does not reference adapter subpath chunks", async () => {
    const result = await buildAll();
    expect(result.success).toBe(true);

    const core = result.outputs.find(
      (o) =>
        o.kind === "entry-point" &&
        o.path.endsWith("index.js") &&
        !o.path.includes("adapters/"),
    );
    expect(core).toBeDefined();

    const text = await core!.text();
    expect(text).not.toMatch(/adapters\/(gam|prebid|apstag)/);
  });

  test("consumer bundle importing only core has no adapter code", async () => {
    const result = await Bun.build({
      entrypoints: ["./test/fixtures/core-only-consumer.ts"],
      target: "browser",
      format: "esm",
      minify: true,
    });
    expect(result.success).toBe(true);

    const bundle = await result.outputs[0]!.text();
    for (const name of ["gam", "prebid", "apstag"]) {
      expect(bundle).not.toMatch(new RegExp(`adapters/${name}`));
      expect(bundle).not.toMatch(new RegExp(`"${name}"`));
    }
  });
});
