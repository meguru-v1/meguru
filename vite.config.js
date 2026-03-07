import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Cache bust: 2026-02-17
export default defineConfig({
  plugins: [
    react()
  ],
  base: '/meguru/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          maps: ['@vis.gl/react-google-maps'],
          ui: ['lucide-react', 'framer-motion']
        }
      }
    }
  }
})
