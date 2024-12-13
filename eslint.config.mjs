import typescriptEslintEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsdoc from "eslint-plugin-tsdoc";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { includeIgnoreFile } from "@eslint/compat";
const gitignorePath = path.resolve(__dirname, ".gitignore");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
), {
    plugins: {
        "@typescript-eslint": typescriptEslintEslintPlugin,
        tsdoc,
    },

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
            ...globals.jest,
            ...globals.commonjs,
        },

        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",

        parserOptions: {
            sourceType: 'module',
            project: './tsconfig.json',
        },
    },

    rules: {
        "tsdoc/syntax": "warn",

        "max-len": ["error", {
            code: 150,
            ignoreUrls: true,
            ignoreStrings: true,
            ignoreTemplateLiterals: true,
            ignoreComments: true,
            ignoreRegExpLiterals: true,
        }],

        "prettier/prettier": ["error", {
            singleQuote: true,
            trailingComma: "es5",
        }],
    },

    ignores: [
        "jest.config.js",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "typedoc.json",
    ],
},
includeIgnoreFile(gitignorePath),
{
    // your overrides
},
];