const pkg = await Bun.file("./package.json").json();

// Enumerated "./adapters/<name>" keys in the exports map drive the build.
// The "./adapters/*" wildcard is for consumer path resolution, not for
// emitting files, so it is filtered out.
const adapterSubpaths = Object.keys(pkg.exports).filter(
  (key: string) => key.startsWith("./adapters/") && !key.includes("*"),
);

const entrypoints = [
  "./src/index.ts",
  ...adapterSubpaths.map((key) => `./src${key.slice(1)}.ts`),
];

const result = await Bun.build({
  entrypoints,
  outdir: "./dist",
  target: "browser",
  format: "esm",
  splitting: true,
  minify: true,
  sourcemap: "inline",
});

if (result.success) {
  console.log(`Built ${result.outputs.length} files:`);
  for (const output of result.outputs) {
    console.log(`  ${output.path}`);
  }
} else {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log.message);
  }
  process.exit(1);
}
