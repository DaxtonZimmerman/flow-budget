import { build } from "esbuild";
await build({
  entryPoints: ["src/budget/index.jsx"],
  outfile: "js/flow-react.js",
  bundle: true,
  format: "iife",
  globalName: "FlowBudgetReact",
  minify: true,
  legalComments: "inline",
  jsx: "automatic",
  target: ["safari16", "chrome110"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
console.log("Built the React monthly-budget screens.");
