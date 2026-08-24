import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    '.git',
    'coverage',
    'main.js',
    'obsidian-bridge.mjs',
    'node_modules',
    'package-lock.json',
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.mjs',
            'esbuild.config.mjs',
            'scripts/*.mjs',
            'tests/fixtures/*.mjs',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          acronyms: ['DSH'],
          brands: ['DeepSeek Harness Workbench', 'Vault'],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,mjs}'],
    rules: {
      'obsidianmd/no-global-this': 'off',
      'obsidianmd/prefer-window-timers': 'off',
    },
  },
);
