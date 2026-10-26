import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the KainBain frontend.
//
// The @vitejs/plugin-react plugin enables the AUTOMATIC JSX runtime, so JSX
// components do NOT need to `import React` to be in scope. Without this config
// Vite falls back to the classic JSX runtime, which requires every component
// to import React — a missing import then crashes the whole UI at runtime with
// "React is not defined" (only in the production build, since vitest's config
// already used the plugin). Keeping this config present prevents that entire
// class of bug.
export default defineConfig({
  plugins: [react()],
  // Allow the dev server to serve the repo-root `shared/` module
  // (`shared/modelKeys.js`, the canonical model-key grammar imported by
  // `src/services/api.js`). vite's default `fs.allow` is the workspace root
  // it detects (this `frontend/` folder), which would 403 the import in dev;
  // builds and vitest resolve outside-root relative imports fine.
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
