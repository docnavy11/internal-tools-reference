import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const reactHooksRules =
  reactHooks.configs.flat?.recommended?.rules ??
  reactHooks.configs['recommended-latest']?.rules ??
  reactHooks.configs.recommended.rules;

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      'dist/**',
      'node_modules/**',
      'drizzle/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooksRules },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/server/**/*.ts', 'tests/**/*.ts', '*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  prettier,
);
