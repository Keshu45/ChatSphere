import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
    },
  },

  server: {
      hmr: false,
 

    watch: {
      // Prevent Vite from watching generated/runtime files
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/logs/**',
        '**/*.log',
      ],
    },
  },
});
