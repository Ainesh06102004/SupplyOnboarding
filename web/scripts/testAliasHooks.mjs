// ============================================================================
// Module hooks that let `node --test` load this project's source directly.
//
// Two things stand between plain Node and these files, and neither is worth a
// bundler to solve:
//
//   1. `@/x` is a jsconfig path alias Next understands and Node does not, so
//      `resolve` rewrites it to `src/x` and supplies the extension Node
//      requires for ESM.
//   2. `web/package.json` has no `"type": "module"`, so Node would treat every
//      `.js` file as CommonJS and reject the `import` statements they all use.
//      `load` marks files under `src/` as modules, which is what Next's own
//      bundler already assumes.
//
// Adding `"type": "module"` to package.json would fix (2) globally and put the
// Next build at risk for no benefit. This stays confined to the test command.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = pathToFileURL(`${path.resolve(process.cwd(), "src")}${path.sep}`).href;

const CANDIDATE_SUFFIXES = ["", ".js", ".jsx", ".mjs", "/index.js", "/index.jsx"];

/** First candidate that exists as a file, or null. */
function firstExisting(bare, base) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = new URL(bare + suffix, base);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `@/x` → `src/x`
  if (specifier.startsWith("@/")) {
    const bare = specifier.slice(2);
    const hit = firstExisting(bare, SRC);
    return nextResolve((hit || new URL(bare, SRC)).href, context);
  }

  // Extensionless relative imports: Next resolves these, Node does not.
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL;
    if (parent && parent.startsWith(SRC) && !path.extname(specifier)) {
      const hit = firstExisting(specifier, parent);
      if (hit) return nextResolve(hit.href, context);
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(SRC) && url.endsWith(".js")) {
    return nextLoad(url, { ...context, format: "module" });
  }
  return nextLoad(url, context);
}
