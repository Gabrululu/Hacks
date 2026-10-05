import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "convex/_generated/**",
      ".agents/**",
    ],
  },
  {
    files: ["convex/**/*.ts"],
    extends: [tseslint.configs.base],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_generated/server", "convex/server"],
              importNames: [
                "query",
                "mutation",
                "queryGeneric",
                "mutationGeneric",
              ],
              message: "Use the permission wrappers in lib/functions.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["convex/lib/functions.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
