import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
assert.ok(
  Number(process.versions.node.split(".")[0]) >= 22,
  "Use Node.js 22 or newer.",
);
const read = (p) => readFileSync(p, "utf8"),
  pkg = JSON.parse(read("package.json"));
assert.equal(pkg.dependencies.react, pkg.dependencies["react-dom"]);
for (const value of [pkg.dependencies.react, pkg.devDependencies.esbuild])
  assert.match(value, /^\d+\.\d+\.\d+$/);
const config = read("js/cloud-config.js");
assert.match(config, /https:\/\/[a-z]+\.supabase\.co/);
assert.match(config, /sb_publishable_/);
assert.doesNotMatch(config, /sb_secret_|service_role|BEGIN .*PRIVATE KEY/);
const page = read("dist/budgets.html");
assert.equal((page.match(/id="monthly-budget-board"/g) || []).length, 1);
assert.equal((page.match(/src="js\/flow-react.js/g) || []).length, 1);
assert.ok(
  page.indexOf("js/monthly-budget-data.js") < page.indexOf("js/flow-react.js"),
);
assert.doesNotMatch(page, /src="js\/budgets.js/);
assert.match(read("dist/sw.js"), /js\/flow-react.js/);
assert.match(read("dist/sw.js"), /css\/react-budget.css/);
assert.match(read("dist/sw.js"), /css\/controls.css/);
let pages = 0;
for (const folder of ["dist", "dist/demo"])
  for (const file of readdirSync(folder).filter((p) => p.endsWith(".html"))) {
    pages++;
    const html = read(join(folder, file));
    const styles = [
      ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
    ];
    assert.equal(
      styles.filter((s) => s[1].includes("css/controls.css")).length,
      1,
      file + " needs shared controls once",
    );
    assert.ok(
      styles.at(-1)?.[1].includes("css/controls.css"),
      file + " must load shared controls last",
    );
    for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (/^(https?:|data:|mailto:|tel:|#)/.test(url)) continue;
      const target = url.split(/[?#]/)[0];
      if (!target) continue;
      assert.ok(
        existsSync(join(dirname(join(folder, file)), target)),
        file + " references missing " + target,
      );
    }
  }
console.log(
  "Setup verified: React versions, public configuration, " +
    pages +
    " pages, asset links, and offline budget bundle.",
);
