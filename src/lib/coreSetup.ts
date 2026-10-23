// Startup wiring between the web shell and @swingcheck/core. The core reads no build
// environment (no `import.meta.env`, which React Native's bundler cannot run), so the web
// build injects its configuration here, once, before anything renders. Imported first
// in main.tsx.

import './logger'; // registers the web log transports and environment on import
import { configureApi } from '@swingcheck/core/lib/api';

configureApi({
  url: import.meta.env.VITE_API_URL || '/api/analyze',
  logCost: Boolean(import.meta.env.VITE_DEV_PREVIEW || import.meta.env.VITE_DEBUG_MODE),
});
