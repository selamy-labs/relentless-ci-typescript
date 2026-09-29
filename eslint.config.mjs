import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import vitest from "@vitest/eslint-plugin";
import policy from "./quality/eslint-policy.json" with { type: "json" };

export default [
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...policy,
  { plugins: { sonarjs } },
  { files: ["tests/**/*.ts"], plugins: { vitest } },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
];
