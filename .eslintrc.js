module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  overrides: [],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'max-len': [
      'error',
      {
        code: 150,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreComments: true,
        ignoreRegExpLiterals: true,
      },
    ],
    'prettier/prettier': [
      'error',
      {
        singleQuote: true, // Eliminate escaping.
        trailingComma: 'es5', // For simpler diffs
      },
    ],
  },
  root: true,
  plugins: [
    "@typescript-eslint/eslint-plugin",
    "eslint-plugin-tsdoc"
  ],
  extends: [
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    ecmaVersion: 2018,
    sourceType: "module"
  },
  rules: {
    "tsdoc/syntax": "warn"
  },
  ignorePatterns: [
    "npm_modules/",
    "dist/",
    "cdk.out/",
    ".eslintrc.js",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "typedoc.json"
  ],
};
