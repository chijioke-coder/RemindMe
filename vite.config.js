// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2015', // Transpile optional chaining and other modern syntax
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
})