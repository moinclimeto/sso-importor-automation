import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function stripCrossOrigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossOrigin()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    watch: {
      ignored: ['**/data/**', '**/electron/**', '**/release/**', '**/node_modules/**'],
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'src/main.jsx'],
    include: ['@sentry/electron/renderer'],
  },
})
