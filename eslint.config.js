import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Both additions are gitignored generated trees eslint would otherwise walk, so
  // whether `npm run lint` is clean depended on what happened to be lying around:
  // `dev-dist` is vite-plugin-pwa's dev service worker (bundled workbox), and
  // `training/.venv` is the S-10 Python environment, whose site-packages ship third-
  // party JS (matplotlib's web backend and friends).
  globalIgnores(['dist', 'dev-dist', 'training/.venv']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
