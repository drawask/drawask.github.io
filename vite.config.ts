import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site needs /cadchat/; local dev stays at /.
const base = process.env.GITHUB_PAGES === '1' ? '/cadchat/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web'],
  },
  server: {
    port: 5173,
  },
})
