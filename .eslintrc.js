module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json", "./client-src/tsconfig.json"],
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2020,
  },
  plugins: [
    'react',
    '@typescript-eslint',
    'css-modules'
  ],
  extends: [
    'airbnb',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    "plugin:adonis/typescriptApp",
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:css-modules/recommended',
  ],
  rules: {
    "react/require-default-props": "off",
    "no-shadow": "off",
    "@typescript-eslint/no-shadow": ["error"],
    "no-use-before-define": "off",
    "@typescript-eslint/no-use-before-define": ["error"],
    "brace-style": ["error", "stroustrup"],
    "react/jsx-props-no-spreading": ["off"],
    "jsx-a11y/click-events-have-key-events": ["off"],
    "jsx-a11y/no-static-element-interactions": ["off"],
    "no-param-reassign": ["error", { "props": false }],
    "jsx-a11y/label-has-associated-control": ["off"],
    "react/jsx-filename-extension": [1, { "extensions": [".tsx", ".jsx"] }],
    "semi": "off",
    "import/no-unresolved": ["off"],
    "@typescript-eslint/semi": [
      0,
      "always"
    ],
    "space-before-function-paren": [
      "off"
    ],
    "@typescript-eslint/space-before-function-paren": [
      "off",
    ],
    "@typescript-eslint/explicit-member-accessibility": "off",
    'import/extensions': [
      "error",
      "ignorePackages",
      {
        "js": "never",
        "jsx": "never",
        "ts": "never",
        "tsx": "never"
      }
    ],
    "css-modules/no-unused-class": [2, { "camelCase": true }],
    "css-modules/no-undef-class": [2, { "camelCase": true }],
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: [
          "./tsconfig.json",
          "./client-src/tsconfig.json"
        ],
      },
    }
  }
};
