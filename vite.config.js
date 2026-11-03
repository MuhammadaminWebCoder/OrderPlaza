import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './': the built site works from any folder or sub-path (GitHub Pages, a plain server, a zip).
// Built code goes to dist/static so it never mixes with the renders, videos and models in public/assets.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    assetsDir: 'static',
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // three.js in its own long-cached chunk; it is only fetched when the 3D maket comes into view
        manualChunks: id => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
