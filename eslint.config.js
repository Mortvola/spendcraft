import tseslint from 'typescript-eslint'
import eslint from '@eslint/js'

export default tseslint.config(
  {
    ignores: ["./database/old-migrations/"],
  },
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": "warn",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowInterfaces: 'with-single-extends'
        }
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        }
      ]
    }
  }
)
