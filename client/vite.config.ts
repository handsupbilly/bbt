import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['5173--019dcbb4-caca-7254-bfd9-fb58ea506669.eu-central-1-01.gitpod.dev'],
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
