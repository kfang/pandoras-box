import ts from "typescript-eslint"
import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"

export default ts.config(
  eslint.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...ts.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/public/js/**",
      "**/node_modules/**",
      "**/src/index.ts",
      "**/src/generated.ts",
    ],
  },
)
