# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | yes | Cloudflare Worker that proxies the Anthropic API. |
| `VITE_SUPABASE_URL` | no | Supabase project URL. Enables cross-device swing-history sync. |
| `VITE_SUPABASE_ANON_KEY` | no | Supabase anon key. Required together with `VITE_SUPABASE_URL`. |

### Supabase history sync (optional)

When the two `VITE_SUPABASE_*` variables are set, each analysed swing's **metadata + results**
are mirrored to a `swing_records` table (video blobs and frames stay local in IndexedDB).
History reads then prefer Supabase and fall back to IndexedDB if it is unavailable. With the
variables unset the app is unchanged and runs IndexedDB-only.

Create the table in Supabase:

```sql
create table swing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  created_at timestamptz default now(),
  camera_angle text,
  focus_rule_id text,
  overall_assessment text,
  frame_quality text,
  results jsonb,
  cannot_determine_reasons text[]
);
```

Authentication is not implemented yet, so `user_id` is `null` for now.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
