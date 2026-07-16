import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.turbo/**"],
  },
  {
    files: ["**/*.ts", "**/*.mjs"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "no-console": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    // apps/web (Vite + React): same base rules plus React-specific ones.
    files: ["**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "no-console": "error",
      "no-var": "error",
      "prefer-const": "error",
      ...reactHooks.configs["recommended-latest"].rules,
      ...reactRefresh.configs.vite.rules,
    },
  },
  {
    // shadcn/ui generated components (e.g. button.tsx exporting both the
    // component and its cva variants) are a codegen convention we don't
    // hand-edit; react-refresh's single-component-export rule doesn't apply.
    files: ["**/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
