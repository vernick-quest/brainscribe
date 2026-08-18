import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A `,,` in an array literal creates a HOLE, which shifts every later element and
      // binds a destructured name to `undefined`. On 2026-08-17 exactly that silently
      // killed a whole feature in a Promise.all — build, 826 tests and lint were ALL green
      // over it, because none of them can see a value that was never wired up. This rule
      // is the only gate that catches it.
      'no-sparse-arrays': 'error',
    },
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
