import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 8192,
  },
  server: {
    host: true,
    port: 5173,
  },
})
