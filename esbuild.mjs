import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
