import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

await import("./build-assets.mjs");
await import("./build-demo.mjs");
await import("./build-offline.mjs");

const output = "dist";

rmSync(output, { recursive: true, force: true });
mkdirSync(output);

for (const file of readdirSync(".")) {
    if (file.endsWith(".html")) cpSync(file, join(output, file));
}

cpSync("demo", join(output, "demo"), { recursive: true });
cpSync("vendor", join(output, "vendor"), { recursive: true });
cpSync("sw.js", join(output, "sw.js"));

cpSync("assets", join(output, "assets"), { recursive: true });
cpSync("manifest.webmanifest", join(output, "manifest.webmanifest"));
cpSync("css", join(output, "css"), { recursive: true });
cpSync("js", join(output, "js"), { recursive: true });
writeFileSync(join(output, ".nojekyll"), "");
