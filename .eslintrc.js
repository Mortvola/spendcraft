module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  extends: [
    'plugin:react/recommended',
    'airbnb',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: [
    'react',
  ],
  rules: {
  	"indent": ["error", 4],
	"brace-style": ["error", "stroustrup"],
	"react/jsx-indent-props": ["error", 4],
	"react/jsx-indent": ["error", 4],
	"react/jsx-props-no-spreading": ["off"],
	"jsx-a11y/click-events-have-key-events": ["off"],
	"jsx-a11y/no-static-element-interactions": ["off"],
	"no-param-reassign": ["error", { "props": false }],
  },
};
