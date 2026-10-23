import { builtinModules } from "node:module";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

const isolationMessage =
  "client and server must not depend on Electron or Node (constitution, principles IV and IX).";

export default ts.config(
  { ignores: ["**/node_modules/", "**/out/", "**/dist/", "**/coverage/", "specs/", ".specify/", ".claude/"] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
      },
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ["packages/app/**", "scripts/**", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/client/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["packages/client/**", "packages/server/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["electron", ...builtinModules].map((name) => ({ name, message: isolationMessage })),
          patterns: [{ group: ["node:*", "electron/*"], message: isolationMessage }],
        },
      ],
    },
  },
  {
    files: ["**/*.js"],
    ...ts.configs.disableTypeChecked,
  },
);
