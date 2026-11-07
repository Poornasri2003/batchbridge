import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["web/app.js"],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: "dist/app.js",
  target: "es2022",
});
await Promise.all(
  ["index.html", "style.css"].map((f) => copyFile("web/" + f, "dist/" + f)),
);
console.log("Built BatchBridge frontend.");
