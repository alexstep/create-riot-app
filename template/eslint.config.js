import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import riotProcessor from './eslint.riot-processor.js';

// eslint-config-riot is the style Riot uses inside its own repositories
// (ESLint 10, plus the fp and jsdoc plugins). It does not parse .riot files.
// This app stays on ESLint 9 with @eslint/js and typescript-eslint.

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.riot'],
    processor: riotProcessor,
  },
  {
    files: ['**/*.riot/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
  },
);
