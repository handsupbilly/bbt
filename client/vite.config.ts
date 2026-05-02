import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['5173--019dea7a-db9d-733d-b843-669e32bef1eb.eu-central-1-01.gitpod.dev'],
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
