// Quality fences (CLAUDE.md hard rules). All workspaces lint through this config.
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

const HEX_IN_STRING = 'Literal[value=/#[0-9a-fA-F]{3,8}/]';
const HEX_IN_TEMPLATE = 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.expo/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/*.gen.ts',
    ],
  },
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
  })),
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      // Rule 1: never hardcode user-facing strings — always t('key')
      'i18next/no-literal-string': 'error',
      // Rule 2: no raw colors outside tokens.json
      'no-restricted-syntax': [
        'error',
        {
          selector: HEX_IN_STRING,
          message: 'Raw hex color forbidden — use tokens from @bravotools/theme.',
        },
        {
          selector: HEX_IN_TEMPLATE,
          message: 'Raw hex color forbidden — use tokens from @bravotools/theme.',
        },
      ],
      // Rule 5: Anthropic API is server-side only, through packages/ai contracts
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@anthropic-ai/sdk',
              message: 'AI calls live in packages/ai (server-side only), never in app code.',
            },
          ],
        },
      ],
    },
  },
  {
    // theme package is the one place hex values exist (tokens.json is not linted)
    files: ['packages/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // packages/ai is the sanctioned home of the Anthropic SDK
    files: ['packages/ai/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
