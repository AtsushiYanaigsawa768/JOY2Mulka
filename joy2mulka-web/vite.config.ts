import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Ensure build completes properly
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
  },
  logLevel: 'info',
})
