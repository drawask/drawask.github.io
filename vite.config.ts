import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Org site: https://drawask.github.io/ (repo drawask.github.io → base /)
export default defineConfig({
  base: '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web'],
  },
  server: {
    port: 5173,
  },
})
