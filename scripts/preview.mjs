import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist"),
  port = Number(process.env.FLOW_PREVIEW_PORT || 4330);
if (!existsSync(root)) throw new Error("Run npm run build before preview.");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"),
      file = resolve(
        root,
        "." +
          decodeURIComponent(url.pathname) +
          (url.pathname.endsWith("/") ? "index.html" : ""),
      );
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error();
    res.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-cache");
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    "Flow preview: http://127.0.0.1:" +
      port +
      "/demo/budgets.html?view=categories",
  ),
);
