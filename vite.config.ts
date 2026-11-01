import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The bundle is served by tenure under a CSP without inline script
// (RENT-FE-001 §7, tenure-api Q-96): every script is a file, the service worker
// is registered from the app code, and PrimeVue's runtime styles carry the
// nonce tenure puts into index.html (Q-W1).
// In development, /api and /bff go to a local tenure (TENURE_URL).
const tenure = process.env.TENURE_URL ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tenure',
        short_name: 'Tenure',
        description: 'Gestion locative',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#10b981',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Offline shell only: the hashed assets are precached; index.html is
        // fetched network-first (it carries a per-response nonce); /api and
        // /bff are never cached.
        globPatterns: ['assets/**/*.{js,css,woff2}', 'icon.svg'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/bff/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'shell', networkTimeoutSeconds: 5, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  server: {
    proxy: {
      '/api': { target: tenure, changeOrigin: false },
      '/bff': { target: tenure, changeOrigin: false },
    },
  },
})
