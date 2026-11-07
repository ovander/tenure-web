import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  define: { __WEB_BUILD__: JSON.stringify({ version: '0.0.0-test', vue: 'x', primevue: 'x', vite: 'x' }) },
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
})
