import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

import tsLintParser from "@typescript-eslint/parser";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      curly: ["error", "all"], // Require curly braces for all control statements
    },
  },
  {
    files: ["**/*.{ts,mts,cts}"],
    plugins: { "@typescript-eslint": tsEslintPlugin },
    // No extends for flat config; add recommended rules directly below
    rules: {
      "@typescript-eslint/no-unused-vars": ["error"],
      "@typescript-eslint/explicit-function-return-type": ["warn"],
      curly: ["error", "all"],
    },
    languageOptions: {
      parser: tsLintParser,
      parserOptions: {
        project: "./tsconfig.json", // Ensure TypeScript is aware of your project configuration
        tsconfigRootDir: new URL(".", import.meta.url).pathname,
      },
    },
  },
]);
