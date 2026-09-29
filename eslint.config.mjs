import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import policy from "./quality/eslint-policy.json" with { type: "json" };

export default [
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...policy,
  { plugins: { sonarjs } },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
];
