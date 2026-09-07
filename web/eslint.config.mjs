import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,

  // `no-undef` is NOT in next/core-web-vitals, and this project is plain JS
  // with no typechecker behind it. A reference to a variable that does not
  // exist therefore reached the browser through a clean `npm run build` AND a
  // clean `npm run lint`: CartInsights rendered `scored.length` where `scored`
  // had been removed, and the cart page threw for anyone whose basket was not
  // empty. Nothing else in the toolchain looks for this.
  {
    files: ["src/**/*.{js,jsx,mjs}", "scripts/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    rules: { "no-undef": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
