import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web'],
  },
  server: {
    port: 5173,
  },
})
