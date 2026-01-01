const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "browser",
  format: "esm",
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
